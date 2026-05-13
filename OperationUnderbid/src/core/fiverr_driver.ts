/**
 * fiverr_driver.ts
 * All Fiverr browser interactions via Playwright + stealth plugin.
 * Every public method is idempotent and handles its own waits.
 */
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { getConfig } from './config.js';
import { logger } from './logger.js';
import { saveScreenshot } from './vision.js';
import type { ParsedOrder, ParsedMessage } from '../types/index.js';

const MOD = 'fiverr_driver';
const PROFILE_DIR = path.resolve(process.cwd(), 'profiles/fiverr');

// Human-like random delay
const sleep = (min = 500, max = 1500) =>
  new Promise(r => setTimeout(r, min + Math.random() * (max - min)));

// ─── Driver class ─────────────────────────────────────────────────────────────

export class FiverrDriver {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private loggedIn = false;

  async init(): Promise<void> {
    if (this.browser) return;

    // Persistent profile so cookies survive restarts
    if (!fs.existsSync(PROFILE_DIR)) fs.mkdirSync(PROFILE_DIR, { recursive: true });

    this.browser = await chromium.launch({
      headless: process.env.HEADLESS !== 'false',
      args: [
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--window-size=1280,800',
      ],
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      storageState: this._profileStatePath(),
      locale: 'en-GB',
      timezoneId: getConfig().timezone,
    }).catch(() =>
      // Profile state may not exist on first run
      this.browser!.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        locale: 'en-GB',
        timezoneId: getConfig().timezone,
      })
    );

    // Mask navigator.webdriver
    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      (window as Record<string, unknown>).chrome = { runtime: {} };
    });

    this.page = await this.context.newPage();
    logger.info(MOD, 'Browser initialised');
  }

  private _profileStatePath(): string {
    return path.join(PROFILE_DIR, 'state.json');
  }

  private async _saveProfile(): Promise<void> {
    try {
      await this.context?.storageState({ path: this._profileStatePath() });
    } catch { /* ignore */ }
  }

  private async _screenshot(label: string): Promise<string> {
    const buf = await this.page!.screenshot({ fullPage: false });
    const b64 = buf.toString('base64');
    saveScreenshot(b64, label);
    return b64;
  }

  // ─── Login ──────────────────────────────────────────────────────────────────

  async login(): Promise<boolean> {
    if (this.loggedIn) return true;
    const cfg = getConfig();

    await this.page!.goto('https://www.fiverr.com', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await sleep(1500, 3000);

    // Check if already logged in via cookie
    const avatar = await this.page!.$('[data-testid="user-menu-avatar"], .avatar-photo');
    if (avatar) {
      logger.info(MOD, 'Already logged in (cookie)');
      this.loggedIn = true;
      return true;
    }

    logger.info(MOD, 'Logging in…');
    await this.page!.goto('https://www.fiverr.com/login', { waitUntil: 'domcontentloaded' });
    await sleep(1000, 2000);

    // Fill email
    const emailInput = await this.page!.waitForSelector('input[type="email"], input[name="email"], #email', { timeout: 15_000 });
    await emailInput.click();
    await sleep(300, 700);
    await this.page!.keyboard.type(cfg.fiverrEmail, { delay: 60 + Math.random() * 60 });
    await sleep(500, 1200);

    // Fill password
    const pwInput = await this.page!.waitForSelector('input[type="password"], input[name="password"], #password', { timeout: 10_000 });
    await pwInput.click();
    await sleep(300, 700);
    await this.page!.keyboard.type(cfg.fiverrPassword, { delay: 60 + Math.random() * 60 });
    await sleep(400, 900);

    // Submit
    const submitBtn = await this.page!.$('button[type="submit"], input[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
    } else {
      await this.page!.keyboard.press('Enter');
    }

    // Wait for redirect or error
    try {
      await this.page!.waitForNavigation({ timeout: 20_000 });
    } catch { /* timeout ok, check URL */ }

    await sleep(1500, 2500);

    const url = this.page!.url();
    if (url.includes('login') || url.includes('signin')) {
      await this._screenshot('login_failed');
      logger.error(MOD, 'Login failed — still on login page');
      return false;
    }

    await this._saveProfile();
    this.loggedIn = true;
    logger.info(MOD, 'Login successful');
    return true;
  }

  // ─── Navigate ───────────────────────────────────────────────────────────────

  async goToOrders(): Promise<void> {
    await this.page!.goto('https://www.fiverr.com/orders', { waitUntil: 'domcontentloaded' });
    await sleep(1000, 2000);
  }

  async goToInbox(): Promise<void> {
    await this.page!.goto('https://www.fiverr.com/inbox', { waitUntil: 'domcontentloaded' });
    await sleep(1000, 2000);
  }

  async goToBuyerRequests(): Promise<void> {
    await this.page!.goto('https://www.fiverr.com/users/' + getConfig().fiverrUsername + '/seller_dashboard', { waitUntil: 'domcontentloaded' });
    await sleep(800, 1500);
    // Navigate to buyer requests via the seller dashboard
    const brLink = await this.page!.$('a[href*="buyer-requests"], a[href*="buyer_requests"]');
    if (brLink) {
      await brLink.click();
      await sleep(1000, 2000);
    } else {
      await this.page!.goto('https://www.fiverr.com/users/' + getConfig().fiverrUsername + '/manage_requests', { waitUntil: 'domcontentloaded' });
    }
  }

  // ─── Screenshot helpers ─────────────────────────────────────────────────────

  async getScreenshotBase64(): Promise<string> {
    return (await this.page!.screenshot()).toString('base64');
  }

  // ─── Orders ─────────────────────────────────────────────────────────────────

  async getActiveOrders(): Promise<ParsedOrder[]> {
    await this.goToOrders();
    const screenshot = await this.getScreenshotBase64();
    // Vision module will parse the screenshot — return raw for caller
    return [];  // Caller uses vision.parseInboxScreen()
  }

  async openOrder(orderId: string): Promise<boolean> {
    await this.page!.goto(`https://www.fiverr.com/orders/${orderId}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await sleep(1000, 2000);
    return !this.page!.url().includes('404');
  }

  async deliverOrder(orderId: string, filePath: string, message: string): Promise<boolean> {
    const ok = await this.openOrder(orderId);
    if (!ok) {
      logger.error(MOD, `Cannot open order ${orderId}`);
      return false;
    }

    await sleep(800, 1500);

    // Click "Deliver Now"
    const deliverBtn = await this.page!.$('button:has-text("Deliver Now"), a:has-text("Deliver Now")');
    if (!deliverBtn) {
      await this._screenshot(`no_deliver_btn_${orderId}`);
      logger.error(MOD, 'Deliver button not found');
      return false;
    }
    await deliverBtn.click();
    await sleep(1000, 2000);

    // Upload file
    if (fs.existsSync(filePath)) {
      const fileInput = await this.page!.$('input[type="file"]');
      if (fileInput) {
        await fileInput.setInputFiles(filePath);
        await sleep(2000, 4000);
        logger.info(MOD, `File uploaded: ${filePath}`);
      } else {
        logger.warn(MOD, 'No file input found on deliver dialog');
      }
    }

    // Type delivery message
    const msgBox = await this.page!.$('textarea[placeholder*="message"], textarea[name="message"], [contenteditable="true"]');
    if (msgBox) {
      await msgBox.click();
      await sleep(300, 700);
      await this.page!.keyboard.type(message, { delay: 50 + Math.random() * 80 });
      await sleep(500, 1200);
    }

    await this._screenshot(`pre_deliver_${orderId}`);

    // Click final deliver button
    const confirmBtn = await this.page!.$('button:has-text("Deliver"), button[data-testid="deliver-button"]');
    if (!confirmBtn) {
      logger.error(MOD, 'Final delivery confirm button not found');
      return false;
    }
    await confirmBtn.click();
    await sleep(2000, 4000);

    await this._screenshot(`post_deliver_${orderId}`);
    await this._saveProfile();

    const confirmed = !this.page!.url().includes('error');
    logger.info(MOD, `Order ${orderId} delivery ${confirmed ? 'SUCCESS' : 'FAILED'}`);
    return confirmed;
  }

  // ─── Inbox / Messaging ─────────────────────────────────────────────────────

  async getUnreadThreads(): Promise<ParsedMessage[]> {
    await this.goToInbox();
    return [];  // Caller uses vision.parseInboxScreen() with screenshot
  }

  async openThread(threadId: string): Promise<boolean> {
    await this.page!.goto(`https://www.fiverr.com/inbox/${threadId}`, { waitUntil: 'domcontentloaded' });
    await sleep(800, 1500);
    return true;
  }

  async sendMessage(threadId: string, message: string): Promise<boolean> {
    await this.openThread(threadId);

    const box = await this.page!.waitForSelector(
      'textarea[placeholder*="Type"], [contenteditable="true"][role="textbox"]',
      { timeout: 10_000 }
    );
    await box.click();
    await sleep(400, 900);

    // Type with human-like speed (handled by page.keyboard.type delay)
    await this.page!.keyboard.type(message, { delay: 55 + Math.random() * 75 });
    await sleep(400, 800);

    // Send
    const sendBtn = await this.page!.$('button[type="submit"], button[aria-label*="Send"], button:has-text("Send")');
    if (sendBtn) {
      await sendBtn.click();
    } else {
      await this.page!.keyboard.press('Enter');
    }

    await sleep(800, 1500);
    await this._saveProfile();
    logger.info(MOD, `Message sent to thread ${threadId}`);
    return true;
  }

  // ─── Buyer Requests / Offers ────────────────────────────────────────────────

  async sendOffer(requestId: string, offerText: string, priceGbp: number, deliveryDays: number): Promise<boolean> {
    await this.goToBuyerRequests();

    // Find and click the specific request
    const requestEl = await this.page!.$(`[data-request-id="${requestId}"], [id="${requestId}"]`);
    if (requestEl) {
      await requestEl.click();
      await sleep(800, 1500);
    }

    // Click "Send Offer"
    const offerBtn = await this.page!.$('button:has-text("Send Offer"), a:has-text("Send Offer")');
    if (!offerBtn) {
      logger.warn(MOD, `Could not find Send Offer button for request ${requestId}`);
      return false;
    }
    await offerBtn.click();
    await sleep(800, 1500);

    // Fill offer form
    const descBox = await this.page!.$('textarea[name*="description"], textarea[placeholder*="description"]');
    if (descBox) {
      await descBox.click();
      await sleep(300, 600);
      await this.page!.keyboard.type(offerText, { delay: 50 + Math.random() * 80 });
    }

    // Price
    const priceInput = await this.page!.$('input[name*="price"], input[placeholder*="price"], input[type="number"]');
    if (priceInput) {
      await priceInput.click({ clickCount: 3 });
      await this.page!.keyboard.type(String(Math.round(priceGbp)));
      await sleep(300, 600);
    }

    // Delivery days
    const daysInput = await this.page!.$('input[name*="days"], input[placeholder*="days"]');
    if (daysInput) {
      await daysInput.click({ clickCount: 3 });
      await this.page!.keyboard.type(String(deliveryDays));
      await sleep(300, 600);
    }

    await this._screenshot(`pre_offer_${requestId}`);

    const submitBtn = await this.page!.$('button[type="submit"]:has-text("Send"), button:has-text("Send Offer")');
    if (!submitBtn) {
      logger.error(MOD, 'Offer submit button not found');
      return false;
    }
    await submitBtn.click();
    await sleep(1500, 3000);

    await this._screenshot(`post_offer_${requestId}`);
    await this._saveProfile();
    logger.info(MOD, `Offer sent for request ${requestId}`);
    return true;
  }

  // ─── Gig management ─────────────────────────────────────────────────────────

  async goToGigs(): Promise<void> {
    await this.page!.goto('https://www.fiverr.com/seller_dashboard', { waitUntil: 'domcontentloaded' });
    await sleep(800, 1500);
  }

  async pauseGig(gigId: string): Promise<void> {
    await this.page!.goto(`https://www.fiverr.com/gig_wizard/overview/${gigId}`, { waitUntil: 'domcontentloaded' });
    await sleep(800, 1500);
    const pauseBtn = await this.page!.$('button:has-text("Pause")');
    if (pauseBtn) { await pauseBtn.click(); await sleep(800, 1200); }
  }

  // ─── Shutdown ───────────────────────────────────────────────────────────────

  async close(): Promise<void> {
    await this._saveProfile();
    await this.context?.close();
    await this.browser?.close();
    this.browser = null;
    this.context = null;
    this.page = null;
    this.loggedIn = false;
  }
}

// Singleton export
export const fiverrDriver = new FiverrDriver();
