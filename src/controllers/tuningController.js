/**
 * TvMaster - System Tuning & Remote Controller
 */

const adbService = require('../services/adbService');
const { REGEX_KEYEVENT, REGEX_ANIMATION_SCALE } = require('../constants');

class TuningController {
  /**
   * Get current animation scale
   */
  async getAnimationScale(req, res) {
    try {
      const scale = await adbService.getAnimationScale();
      return res.json({ scale });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * Set animation scale (0, 0.5, 1.0)
   */
  async setAnimationScale(req, res) {
    try {
      const { scale } = req.body;
      const scaleStr = String(scale);
      if (!REGEX_ANIMATION_SCALE.test(scaleStr)) {
        return res.status(400).json({ error: 'Invalid scale value (allowed: 0, 0.25, 0.5, 0.75, 1, 1.5, 2)' });
      }

      const result = await adbService.setAnimationScale(scaleStr);
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * Send simulated D-Pad or Remote key
   */
  async sendRemoteKey(req, res) {
    try {
      const { key } = req.body;
      if (!key || !REGEX_KEYEVENT.test(key)) {
        return res.status(400).json({ error: 'Invalid keyevent' });
      }

      const result = await adbService.sendKeyEvent(key);
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * Send text to active input
   */
  async sendRemoteText(req, res) {
    try {
      const { text } = req.body;
      if (typeof text !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid text' });
      }

      const result = await adbService.sendText(text);
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * Reboot TV
   */
  async reboot(req, res) {
    try {
      const result = await adbService.reboot();
      return res.json({ success: true, message: 'TV reboot command sent' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}

module.exports = new TuningController();
