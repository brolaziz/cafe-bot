const mongoose = require('mongoose');

/** Yagona hujjat — mini-app va bot umumiy sozlamalar */
const appSettingSchema = new mongoose.Schema(
  {
    p2p_card_number: { type: String, default: '', trim: true },
    p2p_card_owner: { type: String, default: '', trim: true },
  },
  { collection: 'appsettings' }
);

module.exports = mongoose.model('AppSetting', appSettingSchema);
