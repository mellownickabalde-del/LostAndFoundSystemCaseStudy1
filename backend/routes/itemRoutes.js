const express = require('express');
const router = express.Router();
const itemController = require('../controllers/itemController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/stats', itemController.getStats);
router.get('/export/excel', adminOnly, itemController.exportExcel);
router.get('/export/pdf', adminOnly, itemController.exportPDF);
router.get('/', itemController.getAllItems);
router.post('/', itemController.createItem);
router.get('/:id', itemController.getItemById);
router.put('/:id', itemController.updateItem);
router.delete('/:id', itemController.deleteItem);
router.put('/:id/claim', itemController.claimItem);
router.put('/:id/resolve', itemController.resolveItem);
router.get('/export/json', adminOnly, itemController.exportJSON);

module.exports = router;