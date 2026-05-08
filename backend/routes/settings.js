const express = require('express');
const AppSetting = require('../models/AppSetting');

const router = express.Router();

async function getOrCreateSettings() {
  let doc = await AppSetting.findOne();
  if (!doc) {
    doc = await AppSetting.create({ p2p_card_number: '', p2p_card_owner: '' });
  }
  return doc;
}

/** Mini-app: P2P karta (admin bot orqali saqlanadi; bo'sh bo'lsa frontend .env ishlatadi) */
router.get('/settings/p2p', async (req, res, next) => {
  try {
    const doc = await getOrCreateSettings();
    res.json({
      card_number: doc.p2p_card_number || '',
      card_owner: doc.p2p_card_owner || '',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
