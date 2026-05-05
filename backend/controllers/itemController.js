const Item = require('../model/item');
const ActivityLog = require('../model/ActivityLog');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const log = async (userId, userName, action, details, itemRef = null) => {
  try {
    await ActivityLog.create({ user: userId, userName, action, details, itemRef });
  } catch (e) {
    console.error('Log error:', e.message);
  }
};

const getAllItems = async (req, res) => {
  try {
    const { type, status, category, search, page = 1, limit = 9, mine } = req.query;
    const filter = {};
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (mine === 'true') filter.reportedBy = req.user._id;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } },
      ];
    }
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const [items, total] = await Promise.all([
      Item.find(filter)
        .populate('reportedBy', 'name email')
        .populate('claimedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Item.countDocuments(filter),
    ]);
    res.json({ items, total, page: pageNum, pages: Math.ceil(total / limitNum), limit: limitNum });
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching items' });
  }
};

const getItemById = async (req, res) => {
  try {
    const item = await Item.findById(req.params.id)
      .populate('reportedBy', 'name email')
      .populate('claimedBy', 'name email');
    if (!item) return res.status(404).json({ message: 'Item not found' });
    res.json(item);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching item' });
  }
};

const getStats = async (req, res) => {
  try {
    const [total, lost, found, open, claimed, resolved, byCategory, byDay] = await Promise.all([
      Item.countDocuments(),
      Item.countDocuments({ type: 'lost' }),
      Item.countDocuments({ type: 'found' }),
      Item.countDocuments({ status: 'open' }),
      Item.countDocuments({ status: 'claimed' }),
      Item.countDocuments({ status: 'resolved' }),
      Item.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Item.aggregate([
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: -1 } },
        { $limit: 7 },
      ]),
    ]);
    res.json({ total, lost, found, open, claimed, resolved, byCategory, byDay: byDay.reverse() });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching stats' });
  }
};

const createItem = async (req, res) => {
  try {
    const { title, description, type, category, location, dateLostOrFound, imageUrl } = req.body;
    if (!title || !description || !type || !location) {
      return res.status(400).json({ message: 'Title, description, type, and location are required' });
    }
    const item = await Item.create({ title, description, type, category, location, dateLostOrFound, imageUrl, reportedBy: req.user._id });
    await item.populate('reportedBy', 'name email');
    await log(req.user._id, req.user.name, 'ITEM_CREATED', `Reported ${type} item: "${title}"`, item._id);
    res.status(201).json(item);
  } catch (error) {
    console.error('Create item error:', error);
    res.status(500).json({ message: 'Server error creating item' });
  }
};

const updateItem = async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Item not found' });
    const isOwner = item.reportedBy.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) return res.status(403).json({ message: 'Not authorized' });
    const { title, description, type, category, location, status, dateLostOrFound, imageUrl } = req.body;
    item.title = title || item.title;
    item.description = description || item.description;
    item.type = type || item.type;
    item.category = category || item.category;
    item.location = location || item.location;
    item.status = status || item.status;
    item.imageUrl = imageUrl !== undefined ? imageUrl : item.imageUrl;
    if (dateLostOrFound) item.dateLostOrFound = dateLostOrFound;
    const updatedItem = await item.save();
    await updatedItem.populate('reportedBy', 'name email');
    await log(req.user._id, req.user.name, 'ITEM_UPDATED', `Updated item: "${updatedItem.title}"`, updatedItem._id);
    res.json(updatedItem);
  } catch (error) {
    res.status(500).json({ message: 'Server error updating item' });
  }
};

const resolveItem = async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Item not found' });
    const isOwner = item.reportedBy.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) return res.status(403).json({ message: 'Only the item owner can resolve this item' });
    if (item.status === 'resolved') return res.status(400).json({ message: 'Item is already resolved' });
    item.status = 'resolved';
    await item.save();
    await item.populate('reportedBy', 'name email');
    await item.populate('claimedBy', 'name email');
    await log(req.user._id, req.user.name, 'ITEM_RESOLVED', `Resolved item: "${item.title}"`, item._id);
    res.json(item);
  } catch (error) {
    res.status(500).json({ message: 'Server error resolving item' });
  }
};

const claimItem = async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Item not found' });
    if (item.status !== 'open') return res.status(400).json({ message: 'This item has already been claimed or resolved' });
    if (item.reportedBy.toString() === req.user._id.toString()) return res.status(400).json({ message: 'You cannot claim your own reported item' });
    item.status = 'claimed';
    item.claimedBy = req.user._id;
    await item.save();
    await item.populate('reportedBy', 'name email');
    await item.populate('claimedBy', 'name email');
    await log(req.user._id, req.user.name, 'ITEM_CLAIMED', `Claimed item: "${item.title}"`, item._id);
    res.json(item);
  } catch (error) {
    res.status(500).json({ message: 'Server error claiming item' });
  }
};

const deleteItem = async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Item not found' });
    const isOwner = item.reportedBy.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) return res.status(403).json({ message: 'Not authorized' });
    const title = item.title;
    await item.deleteOne();
    await log(req.user._id, req.user.name, 'ITEM_DELETED', `Deleted item: "${title}"`);
    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error deleting item' });
  }
};

const exportExcel = async (req, res) => {
  try {
    const items = await Item.find({}).populate('reportedBy', 'name email').populate('claimedBy', 'name email').sort({ createdAt: -1 });
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Lost & Found System';
    const sheet = workbook.addWorksheet('Items Report');
    sheet.columns = [
      { header: 'Title', key: 'title', width: 30 },
      { header: 'Type', key: 'type', width: 10 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Category', key: 'category', width: 18 },
      { header: 'Location', key: 'location', width: 25 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Reported By', key: 'reportedBy', width: 25 },
      { header: 'Claimed By', key: 'claimedBy', width: 25 },
      { header: 'Date Reported', key: 'createdAt', width: 22 },
    ];
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a1a2e' } };
    sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    items.forEach((item) => {
      const row = sheet.addRow({
        title: item.title,
        type: item.type.toUpperCase(),
        status: item.status.toUpperCase(),
        category: item.category,
        location: item.location,
        description: item.description,
        reportedBy: item.reportedBy ? `${item.reportedBy.name} (${item.reportedBy.email})` : 'N/A',
        claimedBy: item.claimedBy ? `${item.claimedBy.name} (${item.claimedBy.email})` : 'N/A',
        createdAt: new Date(item.createdAt).toLocaleString(),
      });
      row.getCell('type').font = { color: { argb: item.type === 'lost' ? 'FFe05454' : 'FF3dba7a' }, bold: true };
    });
    sheet.addRow([]);
    const s = sheet.addRow([`Total: ${items.length}`, '', `Lost: ${items.filter(i=>i.type==='lost').length}`, `Found: ${items.filter(i=>i.type==='found').length}`, `Resolved: ${items.filter(i=>i.status==='resolved').length}`]);
    s.font = { bold: true };
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=LostFound_${Date.now()}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Excel export error:', error);
    res.status(500).json({ message: 'Error exporting Excel' });
  }
};

const exportPDF = async (req, res) => {
  try {
    const items = await Item.find({}).populate('reportedBy', 'name email').populate('claimedBy', 'name email').sort({ createdAt: -1 });
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=LostFound_${Date.now()}.pdf`);
    doc.pipe(res);

    doc.rect(0, 0, doc.page.width, 80).fill('#0f0f11');
    doc.fillColor('#f0a500').fontSize(22).font('Helvetica-Bold').text('Lost & Found System', 40, 18);
    doc.fillColor('#7a7a90').fontSize(9).font('Helvetica').text(`Items Report — Generated: ${new Date().toLocaleString()}`, 40, 50);

    const stats = [
      { label: 'Total', value: items.length },
      { label: 'Lost', value: items.filter(i=>i.type==='lost').length },
      { label: 'Found', value: items.filter(i=>i.type==='found').length },
      { label: 'Resolved', value: items.filter(i=>i.status==='resolved').length },
    ];
    let sx = 40;
    stats.forEach(s => {
      doc.rect(sx, 92, 110, 44).fill('#18181c').stroke('#2e2e38');
      doc.fillColor('#f0a500').fontSize(18).font('Helvetica-Bold').text(String(s.value), sx+10, 100);
      doc.fillColor('#7a7a90').fontSize(8).font('Helvetica').text(s.label, sx+10, 120);
      sx += 118;
    });

    let y = 158;
    doc.rect(40, y, 515, 20).fill('#1a1a2e');
    doc.fillColor('#f0a500').fontSize(7.5).font('Helvetica-Bold');
    doc.text('TITLE', 45, y+6); doc.text('TYPE', 195, y+6); doc.text('STATUS', 250, y+6);
    doc.text('CATEGORY', 310, y+6); doc.text('LOCATION', 385, y+6); doc.text('REPORTED BY', 455, y+6);
    y += 20;

    items.forEach((item, i) => {
      if (y > doc.page.height - 70) { doc.addPage(); y = 40; }
      doc.rect(40, y, 515, 18).fill(i%2===0 ? '#18181c' : '#111114');
      doc.fillColor('#e8e8f0').fontSize(7).font('Helvetica').text(item.title.substring(0,22), 45, y+5);
      doc.fillColor(item.type==='lost'?'#e05454':'#3dba7a').font('Helvetica-Bold').text(item.type.toUpperCase(), 195, y+5);
      doc.fillColor('#aaa').font('Helvetica').text(item.status.toUpperCase(), 250, y+5);
      doc.fillColor('#ccc').text(item.category, 310, y+5);
      doc.fillColor('#bbb').text(item.location.substring(0,14), 385, y+5);
      doc.fillColor('#999').text(item.reportedBy?.name||'N/A', 455, y+5);
      y += 18;
    });

    doc.rect(40, y+8, 515, 1).fill('#2e2e38');
    doc.fillColor('#7a7a90').fontSize(8).text(`Lost & Found System — ${items.length} records exported`, 40, y+16);
    doc.end();
  } catch (error) {
    console.error('PDF export error:', error);
    res.status(500).json({ message: 'Error exporting PDF' });
  }
};

const exportJSON = async (req, res) => {
  try {
    const items = await Item.find({})
      .populate('reportedBy', 'name email')
      .populate('claimedBy', 'name email')
      .sort({ createdAt: -1 });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=LostFound_Backup_${Date.now()}.json`);
    res.json({ exportedAt: new Date(), total: items.length, items });
  } catch (error) {
    res.status(500).json({ message: 'Error exporting JSON' });
  }
};

module.exports = { getAllItems, getItemById, getStats, createItem, updateItem, 
  resolveItem, claimItem, deleteItem, exportExcel, exportPDF, exportJSON };