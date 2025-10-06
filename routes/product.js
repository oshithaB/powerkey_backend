const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const authorizedRoles = require('../middleware/authorized-roles');

const {
    getProducts,
    createProduct,
    updateProduct,
    deleteProduct,
    getCategories,
    getVendors,
    getEmployees
} = require('../controllers/product_controller');

router.get('/getProducts/:company_id', verifyToken, getProducts);

router.post('/products/:company_id', verifyToken, authorizedRoles(['admin']), createProduct);
router.put('/products/:company_id/:product_id', verifyToken, authorizedRoles(['admin']), updateProduct);
router.delete('/products/:company_id/:product_id', verifyToken, authorizedRoles(['admin']), deleteProduct);

router.get('/products/:company_id/categories', verifyToken, getCategories);
router.get('/products/:company_id/vendors', verifyToken, getVendors);
router.get('/products/employees', verifyToken, getEmployees);

module.exports = router;