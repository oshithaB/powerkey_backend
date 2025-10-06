const db = require('../../DB/db');

const getARAgingSummary = async (req, res) => {
    try {
        const { company_id } = req.params;
        const { start_date, end_date } = req.query;

        let currentDate = end_date ? new Date(end_date) : new Date();
        let startDate = start_date ? new Date(start_date) : null;

        if (!startDate) {
            if (req.query.filter === 'week') {
                startDate = new Date(currentDate);
                startDate.setDate(currentDate.getDate() - 7);
            } else if (req.query.filter === 'month') {
                startDate = new Date(currentDate);
                startDate.setMonth(currentDate.getMonth() - 1);
            } else {
                startDate = new Date(currentDate.getFullYear(), 0, 1);
            }
        }

        const next15Days = new Date(currentDate);
        next15Days.setDate(currentDate.getDate() + 15);
        const next30Days = new Date(currentDate);
        next30Days.setDate(currentDate.getDate() + 30);
        const next60Days = new Date(currentDate);
        next60Days.setDate(currentDate.getDate() + 60);
        
        // Add this line to calculate 60 days ago from current date
        const past60Days = new Date(currentDate);
        past60Days.setDate(currentDate.getDate() - 60);

        const query = `
            SELECT 
                co.name AS company_name,
                c.id AS customer_id,
                c.name AS customer_name,
                SUM(CASE WHEN i.due_date = ? THEN i.balance_due ELSE 0 END) AS due_today,
                SUM(CASE WHEN i.due_date > ? AND i.due_date <= ? THEN i.balance_due ELSE 0 END) AS due_15_days,
                SUM(CASE WHEN i.due_date > ? AND i.due_date <= ? THEN i.balance_due ELSE 0 END) AS due_30_days,
                SUM(CASE WHEN i.due_date > ? AND i.due_date <= ? THEN i.balance_due ELSE 0 END) AS due_60_days,
                SUM(CASE WHEN i.due_date < ? THEN i.balance_due ELSE 0 END) AS over_60_days,
                SUM(i.balance_due) AS total_due
            FROM 
                invoices i
            LEFT JOIN 
                customer c ON i.customer_id = c.id
            LEFT JOIN 
                company co ON i.company_id = co.company_id
            WHERE 
                i.status != 'proforma' AND i.status != 'paid'
                AND i.company_id = ?
                AND i.invoice_date >= ?
                AND i.invoice_date <= ?
            GROUP BY 
                co.name, c.name
            ORDER BY 
                c.name ASC
        `;

        const params = [
            currentDate.toISOString().split('T')[0], // due_today
            currentDate.toISOString().split('T')[0], next15Days.toISOString().split('T')[0], // due_15_days
            next15Days.toISOString().split('T')[0], next30Days.toISOString().split('T')[0], // due_30_days
            next30Days.toISOString().split('T')[0], next60Days.toISOString().split('T')[0], // due_60_days
            past60Days.toISOString().split('T')[0], // over_60_days - changed this line
            company_id,
            startDate.toISOString().split('T')[0],
            currentDate.toISOString().split('T')[0]
        ];

        const [results] = await db.execute(query, params);

        const agingSummary = results.map(row => ({
            customerId: row.customer_id,
            companyName: row.company_name,
            customerName: row.customer_name,
            dueToday: parseFloat(row.due_today).toFixed(2),
            due15Days: parseFloat(row.due_15_days).toFixed(2),
            due30Days: parseFloat(row.due_30_days).toFixed(2),
            due60Days: parseFloat(row.due_60_days).toFixed(2),
            over60Days: parseFloat(row.over_60_days).toFixed(2),
            total: parseFloat(parseFloat(row.due_today) + parseFloat(row.due_15_days) + parseFloat(row.due_30_days) + parseFloat(row.due_60_days) + parseFloat(row.over_60_days)).toFixed(2),
            totalDue: parseFloat(row.total_due).toFixed(2)
        }));

        res.status(200).json({
            success: true,
            data: agingSummary,
            message: 'A/R Aging Summary report retrieved successfully'
        });
    } catch (error) {
        console.error('Error generating A/R Aging Summary report:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate A/R Aging Summary report',
            error: error.message
        });
    }
};

const getCustomerInvoices = async (req, res) => {
    try {
        const { company_id, customer_id } = req.params;
        const { start_date, end_date } = req.query;

        let query = `
            SELECT 
                i.id AS invoice_id,
                i.invoice_number,
                i.invoice_date,
                i.due_date,
                i.total_amount,
                i.paid_amount,
                i.balance_due,
                i.status
            FROM 
                invoices i
            LEFT JOIN 
                customer c ON i.customer_id = c.id
            WHERE 
                i.company_id = ?
                AND i.customer_id = ?
                AND i.balance_due > 0
        `;

        const params = [company_id, customer_id];

        // Add date filtering if start_date and end_date are provided
        if (start_date && end_date) {
            query += ` AND i.invoice_date >= ? AND i.invoice_date <= ?`;
            params.push(start_date, end_date);
        } else if (start_date) {
            query += ` AND i.invoice_date >= ?`;
            params.push(start_date);
        } else if (end_date) {
            query += ` AND i.invoice_date <= ?`;
            params.push(end_date);
        }

        query += ` ORDER BY i.due_date ASC`;

        const [results] = await db.execute(query, params);

        const invoices = results.map(row => ({
            invoiceId: row.invoice_id,
            invoiceNumber: row.invoice_number,
            invoiceDate: row.invoice_date,
            dueDate: row.due_date,
            totalAmount: parseFloat(row.total_amount).toFixed(2),
            paidAmount: parseFloat(row.paid_amount).toFixed(2),
            balanceDue: parseFloat(row.balance_due).toFixed(2),
            status: row.status
        }));

        // Always return 200 status, even when no invoices are found
        res.status(200).json({
            success: true,
            data: invoices, // This will be an empty array if no invoices found
            message: invoices.length > 0 
                ? 'Customer invoices retrieved successfully' 
                : 'No invoices found for the specified customer in the given date range'
        });
    } catch (error) {
        console.error('Error fetching customer invoices:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch customer invoices',
            error: error.message
        });
    }
};

const getARAgingSummaryInDetails = async (req, res) => {
    try {
        const { company_id, customer_id } = req.params;
        const { start_date, end_date } = req.query;

        let currentDate = end_date ? new Date(end_date) : new Date();
        let startDate = start_date ? new Date(start_date) : null;

        if (!startDate) {
            if (req.query.filter === 'week') {
                startDate = new Date(currentDate);
                startDate.setDate(currentDate.getDate() - 7);
            } else if (req.query.filter === 'month') {
                startDate = new Date(currentDate);
                startDate.setMonth(currentDate.getMonth() - 1);
            } else {
                startDate = new Date(currentDate.getFullYear(), 0, 1);
            }
        }

        const next15Days = new Date(currentDate);
        next15Days.setDate(currentDate.getDate() + 15);
        const next30Days = new Date(currentDate);
        next30Days.setDate(currentDate.getDate() + 30);
        const next60Days = new Date(currentDate);
        next60Days.setDate(currentDate.getDate() + 60);

        const query = `
            SELECT 
                i.id AS invoice_id,
                i.invoice_number,
                i.invoice_date,
                i.due_date,
                i.total_amount,
                i.paid_amount,
                i.balance_due,
                i.status,
                c.name AS customer_name,
                co.name AS company_name,
                CASE 
                    WHEN i.due_date = ? THEN 'due_today'
                    WHEN i.due_date > ? AND i.due_date <= ? THEN 'due_15_days'
                    WHEN i.due_date > ? AND i.due_date <= ? THEN 'due_30_days'
                    WHEN i.due_date > ? AND i.due_date <= ? THEN 'due_60_days'
                    WHEN i.due_date < ? OR i.due_date IS NULL THEN 'over_60_days'
                END AS aging_category
            FROM 
                invoices i
            LEFT JOIN 
                customer c ON i.customer_id = c.id
            LEFT JOIN 
                company co ON i.company_id = co.company_id
            WHERE 
                i.status != 'proforma'
                AND i.balance_due > 0
                AND i.company_id = ?
                AND i.customer_id = ?
                AND i.invoice_date >= ?
                AND i.invoice_date <= ?
            ORDER BY 
                i.invoice_date DESC
        `;

        const params = [
            currentDate.toISOString().split('T')[0],
            currentDate.toISOString().split('T')[0], next15Days.toISOString().split('T')[0],
            next15Days.toISOString().split('T')[0], next30Days.toISOString().split('T')[0],
            next30Days.toISOString().split('T')[0], next60Days.toISOString().split('T')[0],
            currentDate.toISOString().split('T')[0],
            company_id,
            customer_id,
            startDate.toISOString().split('T')[0],
            currentDate.toISOString().split('T')[0]
        ];

        const [results] = await db.execute(query, params);

        // Group invoices by aging category
        const groupedInvoices = {
            due_today: [],
            due_15_days: [],
            due_30_days: [],
            due_60_days: [],
            over_60_days: []
        };

        results.forEach(row => {
            const invoice = {
                invoiceId: row.invoice_id,
                invoiceNumber: row.invoice_number,
                invoiceDate: row.invoice_date,
                dueDate: row.due_date,
                totalAmount: parseFloat(row.total_amount).toFixed(2),
                paidAmount: parseFloat(row.paid_amount).toFixed(2),
                balanceDue: parseFloat(row.balance_due).toFixed(2),
                status: row.status,
                customerName: row.customer_name,
                companyName: row.company_name
            };

            groupedInvoices[row.aging_category].push(invoice);
        });

        if (Object.values(groupedInvoices).every(category => category.length === 0)) {
            return res.status(404).json({
                success: false,
                message: 'No invoices found for the specified customer in the given date range'
            });
        }

        res.status(200).json({
            success: true,
            data: groupedInvoices,
            message: 'A/R Aging Details report retrieved successfully'
        });

    } catch (error) {
        console.error('Error generating A/R Aging Details report:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate A/R Aging Details report',
            error: error.message
        });
    }
};

module.exports = {
    getARAgingSummary,
    getCustomerInvoices,
    getARAgingSummaryInDetails,
};