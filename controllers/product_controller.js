const db = require("../DB/db");
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure Product_Uploads directory exists
const uploadDir = path.join(__dirname, 'Product_Uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure Multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'Product_Uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);
        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb(new Error('Only JPEG and PNG images are allowed'));
        }
    }
}).single('image');

const getProducts = async (req, res) => {
    try {
        const { company_id } = req.params;
        
        if (!company_id) {
            return res.status(400).json({ success: false, message: 'Company ID is required' });
        }

        const [products] = await db.query(
            `SELECT p.*, c.name as category_name, v.name as vendor_name, e.name as employee_name
             FROM products p
             LEFT JOIN product_categories c ON p.category_id = c.id
             LEFT JOIN vendor v ON p.preferred_vendor_id = v.vendor_id
             LEFT JOIN employees e ON p.added_employee_id = e.id
             WHERE p.company_id = ? ORDER BY p.created_at DESC`,
            [company_id]
        );

        return res.status(200).json(products);
    } catch (error) {
        console.error('Error fetching products:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const createProduct = async (req, res) => {
    upload(req, res, async (err) => {
        if (err) {
            console.error('Multer error:', err);
            return res.status(400).json({ success: false, message: err.message || 'File upload error' });
        }

        try {
            const { company_id } = req.params;
            const {
                sku,
                name,
                description,
                category_id,
                preferred_vendor_id,
                added_employee_id,
                unit_price,
                cost_price,
                quantity_on_hand,
                manual_count,
                reorder_level,
                order_quantity,
                commission,
                commission_type,  // Add this line
                commission_input  // Add this line
            } = req.body;
            const image = req.file ? `/Product_Uploads/${req.file.filename}` : null;

            // Input validations
            if (!company_id) {
                return res.status(400).json({ success: false, message: 'Company ID is required' });
            }

            if (!name || name.trim() === '') {
                return res.status(400).json({ success: false, message: 'Product name is required' });
            }

            // Validate commission - Changed to allow any positive number (currency amount)
            let validatedCommission = null;
            if (commission !== undefined && commission !== null && commission !== '') {
                const commissionValue = parseFloat(commission);
                if (isNaN(commissionValue) || commissionValue < 0) {
                    return res.status(400).json({ success: false, message: 'Commission must be a positive number' });
                }
                validatedCommission = commissionValue;
            }

            // Validate commission_type
            const validatedCommissionType = commission_type && ['fixed', 'percentage'].includes(commission_type) 
                ? commission_type 
                : 'fixed';

            // Validate commission_input
            let validatedCommissionInput = null;
            if (commission_input !== undefined && commission_input !== null && commission_input !== '') {
                const commissionInputValue = parseFloat(commission_input);
                if (!isNaN(commissionInputValue) && commissionInputValue >= 0) {
                    validatedCommissionInput = commissionInputValue;
                }
            }

            // Validate numeric fields
            const validatedUnitPrice = unit_price ? parseFloat(unit_price) : 0;
            const validatedCostPrice = cost_price ? parseFloat(cost_price) : 0;
            const validatedQuantity = quantity_on_hand ? parseInt(quantity_on_hand) : 0;
            const validateManualCount = manual_count ? parseInt(manual_count) : 0;
            const validatedReorderLevel = reorder_level ? parseInt(reorder_level) : 0;
            const validatedOrderQuantity = order_quantity ? parseInt(order_quantity) : 0;

            if (isNaN(validatedUnitPrice) || isNaN(validatedCostPrice) || 
                isNaN(validatedQuantity) || isNaN(validatedReorderLevel) ||
                isNaN(validateManualCount) || isNaN(validatedOrderQuantity)) {
                return res.status(400).json({ success: false, message: 'Invalid numeric values provided' });
            }

            // Check for existing SKU
            if (sku) {
                const [existingProduct] = await db.query(
                    'SELECT * FROM products WHERE company_id = ? AND sku = ?',
                    [company_id, sku]
                );

                if (existingProduct.length > 0) {
                    return res.status(400).json({ success: false, message: 'Product with this SKU already exists' });
                }
            }

            // Validate referenced IDs
            if (category_id) {
                const [category] = await db.query('SELECT id FROM product_categories WHERE id = ? AND company_id = ?', [category_id, company_id]);
                if (category.length === 0) {
                    return res.status(400).json({ success: false, message: 'Invalid category ID' });
                }
            }

            if (preferred_vendor_id) {
                const [vendor] = await db.query('SELECT vendor_id FROM vendor WHERE vendor_id = ? AND company_id = ?', [preferred_vendor_id, company_id]);
                if (vendor.length === 0) {
                    return res.status(400).json({ success: false, message: 'Invalid vendor ID' });
                }
            }

            if (added_employee_id) {
                const [employee] = await db.query('SELECT id FROM employees WHERE id = ?', [added_employee_id]);
                if (employee.length === 0) {
                    return res.status(400).json({ success: false, message: 'Invalid employee ID' });
                }
            }

            // Generate SKU if not provided
            let productSku = sku;
            if (!productSku) {
                const [lastProduct] = await db.query(
                    'SELECT sku FROM products WHERE company_id = ? AND sku IS NOT NULL ORDER BY id DESC LIMIT 1',
                    [company_id]
                );

                let skuNumber = 1;
                if (lastProduct.length > 0 && lastProduct[0].sku) {
                    const lastSku = lastProduct[0].sku;
                    const lastNumber = parseInt(lastSku.replace('PRD', ''));
                    if (!isNaN(lastNumber)) {
                        skuNumber = lastNumber + 1;
                    }
                }
                productSku = `PRD${String(skuNumber).padStart(3, '0')}`;
            }

            const [result] = await db.query(
                `INSERT INTO products (
                    company_id, sku, name, image, description, category_id, 
                    preferred_vendor_id, added_employee_id, unit_price, cost_price, 
                    quantity_on_hand, manual_count, reorder_level, order_quantity, 
                    commission, commission_type, is_active
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    company_id, 
                    productSku, 
                    name, 
                    image, 
                    description || null, 
                    category_id || null,
                    preferred_vendor_id || null, 
                    added_employee_id || null, 
                    validatedUnitPrice, 
                    validatedCostPrice,
                    validatedQuantity, 
                    validateManualCount,
                    validatedReorderLevel, 
                    validatedOrderQuantity,
                    validatedCommission, 
                    validatedCommissionType,  // Add this line
                    true
                ]
            );

            const productData = {
                id: result.insertId,
                company_id: parseInt(company_id),
                sku: productSku,
                name,
                image,
                description: description || null,
                category_id: category_id ? parseInt(category_id) : null,
                preferred_vendor_id: preferred_vendor_id ? parseInt(preferred_vendor_id) : null,
                added_employee_id: added_employee_id ? parseInt(added_employee_id) : null,
                unit_price: validatedUnitPrice,
                cost_price: validatedCostPrice,
                quantity_on_hand: validatedQuantity,
                manual_count: validateManualCount,
                reorder_level: validatedReorderLevel,
                order_quantity: validatedOrderQuantity,
                commission: validatedCommission,
                commission_type: validatedCommissionType,  // Add this line
                is_active: true,
                created_at: new Date()
            };

            return res.status(201).json({
                success: true,
                message: 'Product created successfully',
                product: productData
            });

        } catch (error) {
            console.error('Error creating product:', error);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    });
};

const updateProduct = async (req, res) => {
    upload(req, res, async (err) => {
        if (err) {
            console.error('Multer error:', err);
            return res.status(400).json({ success: false, message: err.message || 'File upload error' });
        }

        try {
            const { company_id, product_id } = req.params;
            const {
                sku,
                name,
                description,
                category_id,
                preferred_vendor_id,
                added_employee_id,
                unit_price,
                cost_price,
                quantity_on_hand,
                manual_count,
                reorder_level,
                order_quantity,  // Add this line
                commission,      // Add this line
                commission_type, // Add this line
                commission_input, // Add this line
                is_active
            } = req.body;
            const image = req.file ? `/Product_Uploads/${req.file.filename}` : req.body.image;

            if (!company_id || !product_id) {
                return res.status(400).json({ success: false, message: 'Company ID and Product ID are required' });
            }

            const [existingProduct] = await db.query(
                'SELECT * FROM products WHERE id = ? AND company_id = ?',
                [product_id, company_id]
            );

            if (existingProduct.length === 0) {
                return res.status(404).json({ success: false, message: 'Product not found' });
            }

            if (sku) {
                const [skuConflict] = await db.query(
                    'SELECT * FROM products WHERE company_id = ? AND sku = ? AND id != ?',
                    [company_id, sku, product_id]
                );

                if (skuConflict.length > 0) {
                    return res.status(400).json({ success: false, message: 'SKU already in use by another product' });
                }
            }

            if (category_id) {
                const [category] = await db.query('SELECT id FROM product_categories WHERE id = ? AND company_id = ?', [category_id, company_id]);
                if (category.length === 0) {
                    return res.status(400).json({ success: false, message: 'Invalid category ID' });
                }
            }

            if (preferred_vendor_id) {
                const [vendor] = await db.query('SELECT vendor_id FROM vendor WHERE vendor_id = ? AND company_id = ?', [preferred_vendor_id, company_id]);
                if (vendor.length === 0) {
                    return res.status(400).json({ success: false, message: 'Invalid vendor ID' });
                }
            }

            if (added_employee_id) {
                const [employee] = await db.query('SELECT id FROM employees WHERE id = ?', [added_employee_id]);
                if (employee.length === 0) {
                    return res.status(400).json({ success: false, message: 'Invalid employee ID' });
                }
            }

            const allowedFields = [
                'sku', 'name', 'image', 'description', 'category_id', 
                'preferred_vendor_id', 'added_employee_id', 'unit_price', 
                'cost_price', 'quantity_on_hand', 'manual_count', 'reorder_level', 
                'order_quantity', 'commission', 'commission_type', 'is_active'  // Add commission_type here
            ];

            const fieldsToUpdate = {};
            for (const key of allowedFields) {
                if (req.body[key] !== undefined) {
                    fieldsToUpdate[key] = req.body[key];
                }
            }
            if (image) {
                fieldsToUpdate['image'] = image;
            }

            if (Object.keys(fieldsToUpdate).length === 0) {
                return res.status(400).json({ success: false, message: 'No valid fields to update' });
            }

            const setClauses = [];
            const values = [];

            for (const key in fieldsToUpdate) {
                setClauses.push(`${key} = ?`);
                values.push(fieldsToUpdate[key]);
            }

            values.push(product_id, company_id);

            const updateQuery = `UPDATE products SET ${setClauses.join(', ')} WHERE id = ? AND company_id = ?`;
            const [result] = await db.query(updateQuery, values);

            if (result.affectedRows === 0) {
                return res.status(400).json({ success: false, message: 'No changes made to the product' });
            }

            return res.status(200).json({
                success: true,
                message: 'Product updated successfully'
            });

        } catch (error) {
            console.error('Error updating product:', error);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    });
};

const deleteProduct = async (req, res) => {
    try {
        const { company_id, product_id } = req.params;

        if (!company_id || !product_id) {
            return res.status(400).json({ success: false, message: 'Company ID and Product ID are required' });
        }

        const [existingProduct] = await db.query(
            'SELECT * FROM products WHERE id = ? AND company_id = ?',
            [product_id, company_id]
        );

        if (existingProduct.length === 0) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        const [result] = await db.query(
            'DELETE FROM products WHERE id = ? AND company_id = ?',
            [product_id, company_id]
        );

        if (result.affectedRows === 0) {
            return res.status(400).json({ success: false, message: 'Failed to delete product' });
        }

        return res.status(200).json({
            success: true,
            message: 'Product deleted successfully'
        });
    }

    catch (error) {
        console.error('Error deleting product:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const getCategories = async (req, res) => {
    try {
        const { company_id } = req.params;
        if (!company_id) {
            return res.status(400).json({ success: false, message: 'Company ID is required' });
        }

        const [categories] = await db.query(
            'SELECT id, name, is_active, created_at FROM product_categories WHERE company_id = ? ORDER BY name ASC',
            [company_id]
        );

        return res.status(200).json(categories);
    } catch (error) {
        console.error('Error fetching categories:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const getVendors = async (req, res) => {
    try {
        const { company_id } = req.params;
        if (!company_id) {
            return res.status(400).json({ success: false, message: 'Company ID is required' });
        }

        const [vendors] = await db.query(
            'SELECT vendor_id, name FROM vendor WHERE company_id = ? AND is_active = 1 ORDER BY name ASC',
            [company_id]
        );

        return res.status(200).json(vendors);
    } catch (error) {
        console.error('Error fetching vendors:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const getEmployees = async (req, res) => {
    try {
        const [employees] = await db.query(
            'SELECT id, name FROM employees WHERE is_active = 1 ORDER BY name ASC'
        );

        return res.status(200).json(employees);
    } catch (error) {
        console.error('Error fetching employees:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

module.exports = {
    getProducts,
    createProduct,
    updateProduct,
    deleteProduct,
    getCategories,
    getVendors,
    getEmployees
};