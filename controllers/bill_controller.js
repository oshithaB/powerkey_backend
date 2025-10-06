const db = require('../DB/db');

const createBill = async (req, res) => {
  const { company_id } = req.params;
  const {
    bill_number,
    order_id,
    vendor_id,
    bill_date,
    payment_method,
    employee_id,
    due_date,
    terms,
    notes,
    total_amount,
    items,
  } = req.body;

  console.log("Received createBill request for company_id:", company_id);
  console.log("Creating bill with data:", req.body);

  const conn = await db.getConnection();
  await conn.beginTransaction();

  try {
    // Validate required fields
    if (!bill_number) {
      throw new Error('Bill number is required');
    }
    if (!bill_date) {
      throw new Error('Bill date is required');
    }
    if (!due_date) {
      throw new Error('Due date is required - please reselect the vendor name');
    }
    if (!items || items.length === 0) {
      throw new Error('Items are required');
    }

    // Check if order_id is provided and already has a bill
    if (order_id) {
      const [orderCheck] = await conn.execute(
        'SELECT bill_id FROM orders WHERE id = ? AND company_id = ?',
        [order_id, company_id]
      );
      if (orderCheck.length > 0 && orderCheck[0].bill_id !== null) {
        throw new Error('This order has already been converted to a bill');
      }
    }

    // Recalculate total_price for each item using the correct field names from frontend
    const recalculatedItems = items.map(item => {
      const quantity = Number(item.quantity) || 0;
      const costPrice = Number(item.cost_price) || 0; // Using cost_price from frontend
      const taxRate = Number(item.tax_rate) || 0;
      
      // Calculate actual unit price (price before tax)
      const actualUnitPrice = Number((costPrice / (1 + taxRate / 100)).toFixed(2));
      const taxAmount = Number((actualUnitPrice * quantity * taxRate / 100).toFixed(2));
      const totalPrice = Number((quantity * costPrice).toFixed(2));
      
      return { 
        ...item, 
        actual_unit_price: actualUnitPrice,
        tax_amount: taxAmount,
        total_price: totalPrice 
      };
    });

    const calculatedTotal = Number(recalculatedItems.reduce((sum, item) => sum + Number(item.total_price || 0), 0).toFixed(2));

    console.log("Inserting bill with calculated total:", calculatedTotal);

    // Ensure all parameters are properly handled (convert undefined to null)
    const insertParams = [
      company_id,
      bill_number,
      order_id || null,
      vendor_id || null,
      employee_id || null,
      bill_date,
      due_date || null,
      payment_method || null,
      notes || null,
      calculatedTotal,
    ];

    console.log("Insert parameters:", insertParams);

    const [result] = await conn.execute(
      `INSERT INTO bills 
        (company_id, bill_number, order_id, vendor_id, employee_id, bill_date, due_date, payment_method_id, notes, total_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      insertParams
    );

    const billId = result.insertId;

    // Update the orders table with the bill_id if order_id is provided
    if (order_id) {
      await conn.execute(
        'UPDATE orders SET bill_id = ? WHERE id = ? AND company_id = ?',
        [billId, order_id, company_id]
      );
    }

    // Insert bill items
    for (const item of recalculatedItems) {
      const itemParams = [
        billId,
        item.product_id || null,
        item.product_name || '',
        item.description || '',
        Number(item.quantity) || 0,
        Number(item.cost_price) || 0, // Using cost_price as unit_price
        Number(item.total_price) || 0,
      ];

      console.log("Inserting item with params:", itemParams);

      await conn.execute(
        `INSERT INTO bill_items 
          (bill_id, product_id, product_name, description, quantity, unit_price, total_price)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        itemParams
      );
    }
    
    await conn.commit();
    res.status(201).json({ message: "Bill created successfully", billId });
  } catch (error) {
    await conn.rollback();
    console.error("Error creating bill:", error);
    res.status(500).json({ error: error.message || "Failed to create bill" });
  } finally {
    conn.release();
  }
};

const getAllBills = async (req, res) => {
    const { company_id } = req.params;

    try {
        const [bills] = await db.query(
            `SELECT b.*,
            pm.name AS payment_method,
            v.name AS vendor_name,
            o.order_no AS order_number,
            emp.name AS employee_name
            FROM bills b
            LEFT JOIN payment_methods pm ON b.payment_method_id = pm.id
            LEFT JOIN vendor v ON b.vendor_id = v.vendor_id
            LEFT JOIN orders o ON b.order_id = o.id
            LEFT JOIN employees emp ON b.employee_id = emp.id
            WHERE b.company_id = ?
            ORDER BY b.created_at DESC`,
            [company_id]
        );

        // Format dates to prevent timezone issues
        const formattedBills = bills.map(bill => ({
            ...bill,
            bill_date: bill.bill_date ? bill.bill_date : null,
            due_date: bill.due_date ? bill.due_date : null,
            created_at: bill.created_at
        }));

        console.log(`Formatted bills for company_id ${company_id}:`, formattedBills);

        res.json(formattedBills);
    } catch (error) {
        console.error('Error fetching bills:', error);
        res.status(500).json({ error: "Failed to fetch bills" });
    }
};

const getBillItemsById = async (req, res) => {
    const { company_id, bill_id } = req.params;

    try {
        const [bill] = await db.query(
            `SELECT * FROM bills WHERE company_id = ? AND id = ?`,
            [company_id, bill_id]
        );

        if (bill.length === 0) {
            return res.status(404).json({ error: "Bill not found" });
        }

        const [items] = await db.query(
            `SELECT * FROM bill_items WHERE bill_id = ?`,
            [bill_id]
        );

        console.log(`Fetched items for bill_id ${bill_id} of company_id ${company_id}:`, items);

        res.json(items);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch bill" });
    }
}

const updateBill = async (req, res) => {
    const { company_id, bill_id } = req.params;

    console.log("Received updateBill request for company_id:", company_id, "bill_id:", bill_id);

    const {
      vendor_id,
      order_id,
      payment_method_id,
      employee_id,
      due_date,
      notes,
      total_amount,
      items,
  } = req.body;

  console.log("Updating bill with data:", req.body);

  const conn = await db.getConnection();
  await conn.beginTransaction();

  try {
    // Update Bill - ensure all undefined values are converted to null
    const updateParams = [
      order_id || null,
      vendor_id || null,
      employee_id || null,
      due_date || null,
      payment_method_id || null,
      notes || null,
      Number(total_amount) || 0,
      bill_id,
      company_id,
    ];

    await conn.execute(
      `UPDATE bills 
       SET order_id=?, vendor_id=?, employee_id=?, due_date=?, payment_method_id=?, notes=?, total_amount=?
       WHERE id=? AND company_id=?`,
      updateParams
    );

    // Replace Items
    await conn.execute(`DELETE FROM bill_items WHERE bill_id=?`, [bill_id]);

    for (const item of items) {
      const itemParams = [
        bill_id,
        item.product_id || null,
        item.product_name || '',
        item.description || '',
        Number(item.quantity) || 0,
        Number(item.cost_price || item.unit_price) || 0, // Handle both field names
        Number(item.total_price) || 0,
      ];

      await conn.execute(
        `INSERT INTO bill_items 
          (bill_id, product_id, product_name, description, quantity, unit_price, total_price)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        itemParams
      );
    }

    await conn.commit();
    res.json({ message: "Bill updated successfully" });
  } catch (error) {
    await conn.rollback();
    console.error(error);
    res.status(500).json({ error: "Failed to update bill" });
  } finally {
    conn.release();
  }
};

const getBillsByVendor = async (req, res) => {
  const { vendor_id, company_id } = req.params;

  if (!vendor_id || !company_id) {
    return res.status(400).json({ error: "Vendor ID and Company ID are required" });
  }

  try {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const query = `SELECT b.* 
            FROM bills b
            WHERE b.vendor_id = ? AND b.company_id = ?
            ORDER BY b.created_at DESC`;

      const [bills] = await connection.query(query, [vendor_id, company_id]);

      if (bills.length === 0) {
        await connection.commit();
        return res.status(404).json({ message: "No bills found for this vendor" });
      }

      const currentDate = new Date();
      for (const bill of bills) {
        const dueDate = new Date(bill.due_date);
        
        // Only update status to overdue if NOT proforma
        if (
          bill.status !== 'proforma' &&
          dueDate < currentDate &&
          bill.status !== 'paid' &&
          bill.status !== 'cancelled' &&
          bill.balance_due > 0
        ) {
          await connection.query(
            `UPDATE bills 
            SET status = 'overdue', updated_at = ?
            WHERE id = ? AND company_id = ?`,
            [new Date(), bill.id, company_id]
          );
          bill.status = 'overdue';
        }

        const [items] = await connection.query(
          `SELECT * FROM bill_items WHERE bill_id = ?`,
          [bill.id]
        );
        bill.items = items;
      }

      await connection.commit();
      res.status(200).json(bills);
    } catch (error) {
      await connection.rollback();
      console.error('Error processing bills by vendor:', error);
      res.status(500).json({ error: 'Internal server error' });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error fetching bills by vendor:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const recordPayment = async (req, res) => {
  const { vendor_id, company_id } = req.params;
  const { payment_amount, payment_date, payment_method, deposit_to, notes, bill_payments } = req.body;

  if (!vendor_id || !company_id) {
    return res.status(400).json({ error: "Vendor ID and Company ID are required" });
  }

  if (!payment_amount || payment_amount <= 0) {
    return res.status(400).json({ error: "Valid payment amount is required" });
  }

  if (!payment_date) {
    return res.status(400).json({ error: "Payment date is required" });
  }

  if (!payment_method) {
    return res.status(400).json({ error: "Payment method is required" });
  }

  if (!bill_payments || !Array.isArray(bill_payments) || bill_payments.length === 0) {
    return res.status(400).json({ error: "Bill payment distribution is required" });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const totalBillPayments = bill_payments.reduce((sum, { payment_amount }) => sum + Number(payment_amount), 0);
    if (Math.abs(totalBillPayments - payment_amount) > 0.01) {
      await connection.rollback();
      return res.status(400).json({ error: "Sum of bill payments does not match total payment amount" });
    }

    const currentDate = new Date();

    for (const billPayment of bill_payments) {
      const { bill_id, payment_amount: billPaymentAmount } = billPayment;

      if (!bill_id || billPaymentAmount <= 0) {
        await connection.rollback();
        return res.status(400).json({ error: "Invalid bill ID or payment amount" });
      }

      const [bill] = await connection.query(
        `SELECT total_amount, paid_amount, due_date, status 
          FROM bills 
          WHERE id = ? AND company_id = ? AND vendor_id = ?`,
        [bill_id, company_id, vendor_id]
      );
      
      if (bill.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: `Bill ${bill_id} not found` });
      }

      const newPaidAmount = (Number(bill[0].paid_amount) || 0) + Number(billPaymentAmount);
      const totalAmount = Number(bill[0].total_amount) || 0;
      const balanceDue = totalAmount - newPaidAmount;
      let status = bill[0].status;
      
      // Only update status if the invoice is NOT proforma
      if (status !== 'proforma') {
        status = 'opened';
      
        if (newPaidAmount >= totalAmount) {
          status = 'paid';
        } else if (newPaidAmount > 0) {
          status = 'partially_paid';
        }
      
        const dueDate = new Date(bill[0].due_date);
        if (
          status !== 'paid' &&
          dueDate < currentDate &&
          balanceDue > 0 &&
          status !== 'cancelled'
        ) {
          status = 'overdue';
        }
      }
      
      // Insert payment
      await connection.query(
        `INSERT INTO bill_payments (bill_id, vendor_id, company_id, payment_amount, payment_date, payment_method, deposit_to, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [bill_id, vendor_id, company_id, billPaymentAmount, payment_date, payment_method, deposit_to, notes || null]
      );
      
      // Update vendor balance
      await connection.query(
        `UPDATE vendor
          SET balance = balance - ?
          WHERE vendor_id = ? AND company_id = ?`,
        [billPaymentAmount, vendor_id, company_id]
      );
      
      // Update bill
      await connection.query(
        `UPDATE bills
          SET paid_amount = ?, 
              balance_due = ?, 
              status = ?, 
              updated_at = ?
          WHERE id = ? AND company_id = ?`,
        [newPaidAmount, balanceDue, status, new Date(), bill_id, company_id]
      );
    }

    await connection.commit();
    res.status(200).json({ message: 'Bill Payment recorded successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error recording payment:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
};

module.exports = {
  createBill,
  getAllBills,
  getBillItemsById,
  updateBill,
  getBillsByVendor,
  recordPayment
};