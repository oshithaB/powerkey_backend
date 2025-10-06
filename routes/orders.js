const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order_controller');
const vendorController = require('../controllers/vendor_controller');
const employeeController = require('../controllers/employee_controller');
const customerController = require('../controllers/customer_controller');

// Order routes
router.get('/orders/count/:companyId', orderController.getOrderCount);
router.get('/getOrders/:companyId', orderController.getOrders);
router.get('/orders/:companyId/:orderId', orderController.getOrder);
router.post('/orders/:companyId', orderController.createOrder);
router.put('/orders/:companyId/:orderId', orderController.updateOrder);
router.delete('/orders/:companyId/:orderId', orderController.deleteOrder);
router.get('/order-items/:companyId', orderController.getOrderItems);
router.get('/order-items/:companyId/:orderId', orderController.getOrderItemsByOrder);
router.post('/order-items/:companyId', orderController.createOrderItem);
router.delete('/order-items/:companyId/:orderId', orderController.deleteOrderItems);
router.get('/stats/:companyId', orderController.getPurchaseStats);

// Vendor routes
router.get('/vendors/:companyId', vendorController.getVendors);

// Employee routes
router.get('/employees', employeeController.getEmployees);

// Customer routes
router.get('/customers/:companyId', customerController.getCustomers);

module.exports = router;