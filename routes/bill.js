const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const authorizedRoles = require('../middleware/authorized-roles');

const {
    createBill,
    getAllBills,
    getBillItemsById,
    updateBill,
    getBillsByVendor,
    recordPayment
} = require('../controllers/bill_controller');

router.post(
    '/createBill/:company_id',
    verifyToken,
    authorizedRoles(['admin', 'sale', 'staff']),
    createBill
);

router.get(
    '/getAllBills/:company_id',
    verifyToken,
    getAllBills
);

router.get(
    '/getBillItems/:company_id/:bill_id',
    verifyToken,
    authorizedRoles(['admin', 'sale', 'staff']),
    getBillItemsById
);

router.put(
    '/updateBill/:company_id/:bill_id',
    verifyToken,
    authorizedRoles(['admin', 'sale', 'staff']),
    updateBill
);

router.get('/getBillsByVendor/:company_id/:vendor_id', 
    verifyToken, 
    authorizedRoles(['admin', 'sale', 'staff']), 
    getBillsByVendor
);

router.post(
    '/recordBillPayment/:company_id/:vendor_id',
    verifyToken,
    authorizedRoles(['admin', 'sale', 'staff']),
    recordPayment
);

module.exports = router;

