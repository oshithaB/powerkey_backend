const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const authorizedRoles = require('../middleware/authorized-roles');

const {
    getCustomers,
    createCustomer,
    updateCustomer,
    softDeleteCustomer
} = require('../controllers/customer_controller');

router.get('/getCustomers/:company_id', verifyToken, getCustomers);
router.post('/createCustomers/:company_id', verifyToken, authorizedRoles(['admin']), createCustomer);
router.put('/updateCustomers/:company_id/:customer_id', verifyToken, authorizedRoles(['admin']), updateCustomer);
router.put('/deleteCustomers/:company_id/:customer_id', verifyToken, authorizedRoles(['admin']), softDeleteCustomer);

module.exports = router;