/* ============================================================
   Salary handling.
   1) Try to read an ACTUAL salary from the posting text.
   2) Otherwise estimate an EXPECTED band (India LPA) from
      seniority in the title. Overseas roles are flagged.
   Returns { display, minLPA, maxLPA, actual:boolean, note }.
   ============================================================ */

const INDIA_HINTS = [
  'india', 'hyderabad', 'mumbai', 'bangalore', 'bengaluru', 'pune',
  'chennai', 'gurgaon', 'gurugram', 'noida', 'delhi', 'kolkata', 'ahmedabad',
];

function isIndia(location) {
  const l = (location || '').toLowerCase();
  return INDIA_HINTS.some((h) => l.includes(h));
}
function isRemote(location) {
  return /remote|anywhere|work from home|wfh/i.test(location || '');
}

/* Pull an explicit salary out of free text, if present. */
function extractActual(text) {
  if (!text) return null;
  const t = text.replace(/\s+/g, ' ');

  // ₹ 12,00,000 - 18,00,000 / per annum   OR   12-18 LPA / lakhs
  const lpa = t.match(/(\d{1,3}(?:\.\d+)?)\s*(?:-|–|to)\s*(\d{1,3}(?:\.\d+)?)\s*(?:lpa|lakhs?|lac)/i);
  if (lpa) return { display: `₹${lpa[1]}–${lpa[2]} LPA`, minLPA: +lpa[1], maxLPA: +lpa[2], actual: true };

  const oneLpa = t.match(/(?:₹|inr|rs\.?)\s*(\d{1,3}(?:\.\d+)?)\s*(?:lpa|lakhs?|lac)/i);
  if (oneLpa) return { display: `₹${oneLpa[1]} LPA`, minLPA: +oneLpa[1], maxLPA: +oneLpa[1], actual: true };

  // ₹ 12,00,000 style (absolute rupees) -> convert to LPA
  const abs = t.match(/(?:₹|inr|rs\.?)\s*([\d,]{6,})/i);
  if (abs) {
    const n = +abs[1].replace(/,/g, '');
    if (n >= 300000) {
      const l = +(n / 100000).toFixed(1);
      return { display: `₹${l} LPA`, minLPA: l, maxLPA: l, actual: true };
    }
  }

  // USD / EUR range -> flag as overseas, keep the string
  const usd = t.match(/([$€£])\s?([\d,]{4,})\s*(?:-|–|to)\s*([$€£]?\s?[\d,]{4,})/);
  if (usd) return { display: usd[0].trim(), minLPA: null, maxLPA: null, actual: true, note: 'overseas currency' };

  return null;
}

function seniorityBand(title) {
  const t = (title || '').toLowerCase();
  if (/(director|head of|vice president|\bvp\b)/.test(t)) return [30, 55];
  if (/(principal|manager|lead|team lead)/.test(t)) return [20, 38];
  if (/(senior|sr\.?|consultant)/.test(t)) return [15, 26];
  if (/(specialist|analyst|associate|officer|executive|scientist|coordinator)/.test(t)) return [9, 16];
  return [8, 14];
}

function estimate(job) {
  const actual = extractActual(job.description || '');
  if (actual) {
    return {
      display: actual.actual && actual.minLPA ? `${actual.display}` : actual.display,
      minLPA: actual.minLPA,
      maxLPA: actual.maxLPA,
      actual: true,
      note: actual.note || 'from posting',
    };
  }

  const [lo, hi] = seniorityBand(job.title);
  const india = isIndia(job.location) || isRemote(job.location);
  if (!india && job.location) {
    return {
      display: 'See posting (overseas)',
      minLPA: null,
      maxLPA: null,
      actual: false,
      note: 'non-India role — comp not comparable in LPA',
    };
  }
  return {
    display: `Expected ₹${lo}–${hi} LPA`,
    minLPA: lo,
    maxLPA: hi,
    actual: false,
    note: 'estimated from seniority + India market',
  };
}

module.exports = { estimate, isIndia, isRemote };
