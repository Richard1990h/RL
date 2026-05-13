import { logger } from '../../core/logger.js';
import type { Order, GigType } from '../../types/index.js';

import { produceBlog }    from './blog.js';
import { produceLogo }    from './logo.js';
import { produceWebsite } from './website.js';
import { produceSeo }     from './seo.js';
import { produceCaption } from './caption.js';
import { produceSocial }  from './social.js';

const MOD = 'producers:index';

// ─── Dispatch map ─────────────────────────────────────────────────────────────

type ProducerFn = (order: Order) => Promise<string>;

const PRODUCERS: Record<GigType, ProducerFn> = {
  blog:    produceBlog,
  logo:    produceLogo,
  website: produceWebsite,
  seo:     produceSeo,
  caption: produceCaption,
  social:  produceSocial,
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Routes an Order to the appropriate producer based on `order.gig_type`
 * and returns the absolute path of the generated deliverable file.
 *
 * Throws if the gig_type is unrecognised or if the producer itself throws.
 */
export async function produceDeliverable(order: Order): Promise<string> {
  const producer = PRODUCERS[order.gig_type];

  if (!producer) {
    const known = Object.keys(PRODUCERS).join(', ');
    throw new Error(
      `No producer registered for gig_type "${order.gig_type}" (order ${order.id}). ` +
      `Known types: ${known}`,
    );
  }

  logger.info(MOD, `Dispatching order to producer`, {
    orderId:  order.id,
    gigType:  order.gig_type,
    buyer:    order.buyer_name,
    priceGbp: order.price_gbp,
  });

  const start = Date.now();

  try {
    const filePath = await producer(order);
    const durationMs = Date.now() - start;

    logger.info(MOD, `Producer completed successfully`, {
      orderId:    order.id,
      gigType:    order.gig_type,
      filePath,
      durationMs,
    });

    return filePath;
  } catch (err) {
    const durationMs = Date.now() - start;
    logger.error(MOD, `Producer failed`, {
      orderId:    order.id,
      gigType:    order.gig_type,
      durationMs,
      error:      (err as Error).message,
    });
    throw err;
  }
}

// ─── Re-export individual producers for direct use if needed ──────────────────

export { produceBlog }    from './blog.js';
export { produceLogo }    from './logo.js';
export { produceWebsite } from './website.js';
export { produceSeo }     from './seo.js';
export { produceCaption } from './caption.js';
export { produceSocial }  from './social.js';
