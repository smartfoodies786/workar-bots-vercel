// ============================================================
//  ECOMMERCE WHATSAPP BOT V2 — FULL & FINAL
//  Extra features: VIP membership, Birthday discounts,
//  Loyalty cashback, Referrals, Review rewards, Reorder,
//  Product recommendations, Bundle deals, Restock alerts,
//  Multi-currency, Owner revenue dashboard, Coupon system
// ============================================================

const express = require("express");
const twilio  = require("twilio");
const axios   = require("axios");
const cron    = require("node-cron");
require("dotenv").config();

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// ============================================================
//  SETTINGS
// ============================================================
const SETTINGS = {
  storeName:    process.env.STORE_NAME    || "TrendShop",
  storeUrl:     process.env.STORE_URL     || "https://trendshop.com",
  email:        process.env.STORE_EMAIL   || "support@trendshop.com",
  phone:        process.env.STORE_PHONE   || "+1 (555) 123-4567",
  instagram:    process.env.STORE_INSTAGRAM || "@trendshop",
  facebook:     process.env.STORE_FACEBOOK  || "facebook.com/trendshop",
  googleReview: process.env.GOOGLE_REVIEW   || "https://g.page/r/trendshop/review",
  trustpilot:   process.env.TRUSTPILOT_URL  || "https://trustpilot.com/review/trendshop.com",
  vipThreshold: parseFloat(process.env.VIP_THRESHOLD || "500"),
  cashbackRate: parseFloat(process.env.CASHBACK_RATE || "5"),
};

// ============================================================
//  PRODUCT CATALOG
// ============================================================
let PRODUCTS = [
  { id:"P001", name:"Classic White Tee",    price:24.99, category:"Clothing",     stock:true,  desc:"100% cotton, unisex, sizes S-XXL",     tags:["clothing","basic","casual"] },
  { id:"P002", name:"Premium Hoodie",        price:49.99, category:"Clothing",     stock:true,  desc:"Fleece lined, kangaroo pocket, S-XL",   tags:["clothing","winter","premium"] },
  { id:"P003", name:"Slim Fit Jeans",        price:59.99, category:"Clothing",     stock:true,  desc:"Stretch denim, 5 colors available",     tags:["clothing","denim","fashion"] },
  { id:"P004", name:"Leather Wallet",        price:34.99, category:"Accessories",  stock:true,  desc:"Genuine leather, RFID blocking, slim",  tags:["accessories","gift","leather"] },
  { id:"P005", name:"Canvas Tote Bag",       price:19.99, category:"Accessories",  stock:true,  desc:"Heavy duty canvas, 15L capacity",       tags:["accessories","bag","eco"] },
  { id:"P006", name:"Wireless Earbuds",      price:79.99, category:"Electronics",  stock:true,  desc:"Bluetooth 5.0, 24hr battery, noise cancel", tags:["electronics","audio","tech"] },
  { id:"P007", name:"Phone Case Universal",  price:14.99, category:"Electronics",  stock:true,  desc:"Shockproof, iPhone & Samsung",          tags:["electronics","phone","protection"] },
  { id:"P008", name:"Yoga Mat",              price:39.99, category:"Fitness",      stock:false, desc:"Non-slip, 6mm, carry strap included",   tags:["fitness","yoga","sport"] },
  { id:"P009", name:"Water Bottle 1L",       price:22.99, category:"Fitness",      stock:true,  desc:"BPA free, insulated, keeps cold 24hr",  tags:["fitness","hydration","eco"] },
  { id:"P010", name:"Sunglasses Polarized",  price:44.99, category:"Accessories",  stock:true,  desc:"UV400, polarized, unisex style",        tags:["accessories","summer","fashion"] },
];

// ============================================================
//  STATE
// ============================================================
const sessions    = {};  // { phone: { step, data } }
const customers   = {};  // { phone: { name, email, birthday, tier, points, cashback, totalSpend, orders[], referralCode, referredBy } }
const orders      = {};  // { id: { phone, items, total, status, address, type, discount } }
const wishlists   = {};  // { phone: [ productId ] }
const returns     = {};  // { id: { phone, orderId, reason, type, status } }
const coupons     = {};  // { code: { discount, type, expiry, usedBy[] } }
const referrals   = {};  // { code: phone }
const waitlist    = {};  // { productId: [ phone ] }
const reviews     = {};  // { phone: [ { productId, rating, comment } ] }
const carts       = {};  // { phone: { items, lastActive, recovered } }

// ── Default coupons ───────────────────────────────────────────
coupons["WELCOME10"] = { discount:10, type:"percent", expiry:null, usedBy:[] };
coupons["COMEBACK10"]= { discount:10, type:"percent", expiry:null, usedBy:[] };
coupons["REFER10"]   = { discount:10, type:"percent", expiry:null, usedBy:[] };
coupons["BDAY20"]    = { discount:20, type:"percent", expiry:null, usedBy:[] };
coupons["VIP15"]     = { discount:15, type:"percent", expiry:null, usedBy:[] };

// ============================================================
//  HELPERS
// ============================================================
async function sendMsg(to, body) {
  await client.messages.create({
    from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
    to:   `whatsapp:${to}`,
    body,
  });
}

function getOrCreateCustomer(phone) {
  if (!customers[phone]) {
    const code = "SHOP-" + Math.random().toString(36).substr(2,6).toUpperCase();
    customers[phone] = {
      name: null, email: null, birthday: null,
      tier: "Standard", points: 0, cashback: 0,
      totalSpend: 0, orders: [],
      referralCode: code, referredBy: null,
    };
    referrals[code] = phone;
  }
  return customers[phone];
}

function applyCoupon(code, total) {
  const coupon = coupons[code?.toUpperCase()];
  if (!coupon) return { valid: false, discount: 0, final: total };
  if (coupon.expiry && new Date(coupon.expiry) < new Date()) return { valid: false, discount: 0, final: total, msg: "Coupon expired" };
  const discount = coupon.type === "percent" ? (total * coupon.discount / 100) : coupon.discount;
  return { valid: true, discount: discount.toFixed(2), final: (total - discount).toFixed(2), percent: coupon.discount };
}

function getRecommendations(phone) {
  const customer = customers[phone];
  if (!customer?.orders?.length) return PRODUCTS.filter(p => p.stock).slice(0,3);
  const lastOrder = orders[customer.orders[customer.orders.length-1]];
  if (!lastOrder) return PRODUCTS.filter(p => p.stock).slice(0,3);
  const boughtTags = lastOrder.items?.flatMap(item => {
    const prod = PRODUCTS.find(p => item.includes(p.name));
    return prod?.tags || [];
  }) || [];
  return PRODUCTS.filter(p => p.stock && p.tags?.some(t => boughtTags.includes(t))).slice(0,3);
}

function getBundleDiscount(qty) {
  if (qty >= 3) return 20;
  if (qty >= 2) return 10;
  return 0;
}

function formatProducts(category = null) {
  const items = category
    ? PRODUCTS.filter(p => p.category.toLowerCase() === category.toLowerCase())
    : PRODUCTS;
  let txt = `🛍️ *${category || "All Products"} — ${SETTINGS.storeName}*\n━━━━━━━━━━━━━━━━━━━\n\n`;
  items.forEach(p => {
    txt += `${p.stock ? "✅" : "❌"} *${p.name}* — $${p.price}\n`;
    txt += `   ID: ${p.id} | ${p.desc}\n\n`;
  });
  txt += `━━━━━━━━━━━━━━━━━━━\n`;
  txt += `Type *buy [ID]* to order\n`;
  txt += `💡 Buy 2 = 10% off | Buy 3 = 20% off!`;
  return txt;
}

async function getLiveRates() {
  try {
    const res = await axios.get("https://open.er-api.com/v6/latest/USD");
    return res.data.rates;
  } catch { return null; }
}

function mainMenu(customer) {
  const tier = customer?.tier === "VIP" ? "💎 VIP Member" : "";
  return (
    `🛍️ *Welcome to ${SETTINGS.storeName}!*\n` +
    (tier ? `${tier} ✨\n` : "") +
    `Your 24/7 shopping assistant 🤖\n\n` +
    `1️⃣  *shop* — Browse products\n` +
    `2️⃣  *track* — Track your order\n` +
    `3️⃣  *buy [ID]* — Place an order\n` +
    `4️⃣  *convert* — Currency converter\n` +
    `5️⃣  *deals* — Today's deals\n` +
    `6️⃣  *return* — Returns & exchanges\n` +
    `7️⃣  *wishlist* — My wishlist\n` +
    `8️⃣  *loyalty* — My points & cashback\n` +
    `9️⃣  *refer* — Refer a friend\n` +
    `🔟  *reorder* — Repeat last order\n` +
    `💬  *recommend* — What should I buy?\n` +
    `📞  *contact* — Support\n\n` +
    `Type a number or keyword 👇`
  );
}

// ── Abandoned cart recovery ────────────────────────────────────
async function recoverAbandonedCarts() {
  const now = Date.now();
  for (const [phone, cart] of Object.entries(carts)) {
    const hoursSince = (now - cart.lastActive) / (1000*60*60);
    if (hoursSince >= 1 && hoursSince < 2 && !cart.recovered) {
      cart.recovered = true;
      try {
        await sendMsg(phone,
          `🛒 *Hey! You left something behind...*\n\n` +
          `Items in your cart:\n${cart.items?.map(i=>`• ${i}`).join("\n") || "Your selected items"}\n\n` +
          `🎁 *Special offer:* 10% OFF if you order now!\n` +
          `Code: *COMEBACK10*\n\n` +
          `⏰ Valid for 2 hours only!\n\n` +
          `Type *buy [product ID]* to complete your order 🚀`
        );
      } catch {}
    }
  }
}

// ── Check birthdays ────────────────────────────────────────────
async function checkBirthdays() {
  const today = new Date();
  const mm    = String(today.getMonth()+1).padStart(2,"0");
  const dd    = String(today.getDate()).padStart(2,"0");
  for (const [phone, c] of Object.entries(customers)) {
    if (c.birthday && c.birthday === `${mm}-${dd}`) {
      try {
        await sendMsg(phone,
          `🎂 *Happy Birthday from ${SETTINGS.storeName}!*\n\n` +
          `Wishing you an amazing day! 🎉\n\n` +
          `🎁 *Birthday Gift:*\n` +
          `20% OFF your entire order today!\n` +
          `Code: *BDAY20*\n\n` +
          `🛍️ Shop now: ${SETTINGS.storeUrl}\n\n` +
          `Or type *shop* to browse! 🎊`
        );
      } catch {}
    }
  }
}

// ── Weekly flash sale ──────────────────────────────────────────
async function weeklyFlashSale() {
  const phones = Object.keys(customers).filter(p => customers[p].name);
  if (phones.length === 0) return;
  const randomProduct = PRODUCTS.filter(p => p.stock)[Math.floor(Math.random()*PRODUCTS.filter(p=>p.stock).length)];
  for (const phone of phones) {
    try {
      const isVIP = customers[phone]?.tier === "VIP";
      await sendMsg(phone,
        `⚡ *FLASH SALE — ${SETTINGS.storeName}!*\n\n` +
        `🔥 *${randomProduct.name}*\n` +
        `~~$${randomProduct.price}~~ → *$${(randomProduct.price*0.8).toFixed(2)}* (20% OFF!)\n\n` +
        (isVIP ? `💎 *VIP Bonus:* Extra 5% OFF — Code: *VIP15*\n\n` : "") +
        `⏰ Today only!\n` +
        `Type *buy ${randomProduct.id}* to order now! 🚀`
      );
      await new Promise(r => setTimeout(r, 300));
    } catch {}
  }
}

// ── Weekly owner report ────────────────────────────────────────
async function weeklyReport() {
  if (!process.env.OWNER_PHONE) return;
  const totalRevenue  = Object.values(orders).reduce((a,o) => a+(parseFloat(o.total)||0), 0);
  const totalOrders   = Object.keys(orders).length;
  const totalCustomers = Object.keys(customers).length;
  const vipCustomers  = Object.values(customers).filter(c => c.tier==="VIP").length;
  const pendingReturns = Object.values(returns).filter(r => r.status==="Pending").length;
  const topProducts   = Object.values(orders)
    .flatMap(o => o.items||[])
    .reduce((acc,item) => { acc[item]=(acc[item]||0)+1; return acc; }, {});
  const topItem = Object.entries(topProducts).sort((a,b)=>b[1]-a[1])[0];

  await sendMsg(process.env.OWNER_PHONE,
    `📊 *Weekly Report — ${SETTINGS.storeName}*\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `💰 Total Revenue: $${totalRevenue.toFixed(2)}\n` +
    `📦 Total Orders: ${totalOrders}\n` +
    `👥 Customers: ${totalCustomers}\n` +
    `💎 VIP Members: ${vipCustomers}\n` +
    `↩️ Pending Returns: ${pendingReturns}\n` +
    (topItem ? `🔥 Best Seller: ${topItem[0]} (${topItem[1]} orders)\n` : "") +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `Have a great week! 🚀`
  );
}

// ============================================================
//  CRON JOBS
// ============================================================
cron.schedule("*/30 * * * *",    recoverAbandonedCarts); // Every 30 mins
cron.schedule("0 0  * * *",      checkBirthdays);        // Daily midnight
cron.schedule("0 10 * * 5",      weeklyFlashSale);       // Friday 10am
cron.schedule("0 8  * * 1",      weeklyReport);          // Monday 8am

// ============================================================
//  MAIN WEBHOOK
// ============================================================
app.post("/webhook", async (req, res) => {
  const from   = req.body.From?.replace("whatsapp:", "");
  const rawMsg = (req.body.Body || "").trim();
  const msg    = rawMsg.toLowerCase().trim();

  res.sendStatus(200);

  const customer = getOrCreateCustomer(from);

  // ── OWNER COMMANDS ──────────────────────────────────────────
  if (from === process.env.OWNER_PHONE) {

    if (msg.startsWith("!flash ")) {
      const parts = rawMsg.slice(7).split("|");
      const code = parts[0]?.trim(), desc = parts[1]?.trim(), exp = parts[2]?.trim();
      let sent = 0;
      for (const phone of Object.keys(customers).filter(p=>customers[p].name)) {
        try {
          await sendMsg(phone,
            `⚡ *FLASH SALE — ${SETTINGS.storeName}!*\n\n` +
            `🎁 ${desc}\n🏷️ Code: *${code}*\n` +
            `⏰ ${exp || "Limited time!"}\n\n` +
            `🛍️ Shop: ${SETTINGS.storeUrl}`
          );
          sent++; await new Promise(r=>setTimeout(r,300));
        } catch {}
      }
      await sendMsg(from, `✅ Flash sale sent to *${sent}* customers!`); return;
    }

    if (msg.startsWith("!vip ")) {
      const phone = rawMsg.slice(5).trim();
      if (customers[phone]) {
        customers[phone].tier = "VIP";
        try {
          await sendMsg(phone,
            `💎 *Congratulations! You are now a VIP Member!*\n\n` +
            `Welcome to ${SETTINGS.storeName} VIP Club! 🎉\n\n` +
            `*Your VIP Benefits:*\n` +
            `✅ 15% OFF all orders — Code: *VIP15*\n` +
            `✅ Early access to sales\n` +
            `✅ Free shipping on all orders\n` +
            `✅ Priority customer support\n` +
            `✅ Double loyalty points\n\n` +
            `Thank you for your loyalty! 💎`
          );
        } catch {}
        await sendMsg(from, `✅ ${customers[phone].name || phone} upgraded to VIP!`);
      } else await sendMsg(from, `❌ Customer not found: ${phone}`);
      return;
    }

    if (msg.startsWith("!restock ")) {
      const productName = rawMsg.slice(9).trim();
      const product = PRODUCTS.find(p => p.name.toLowerCase().includes(productName.toLowerCase()));
      if (product) {
        product.stock = true;
        const waitlistPhones = waitlist[product.id] || [];
        let sent = 0;
        for (const phone of waitlistPhones) {
          try {
            await sendMsg(phone,
              `🔔 *Back in Stock Alert!*\n\n` +
              `✅ *${product.name}* is now available!\n` +
              `💰 Price: $${product.price}\n\n` +
              `Type *buy ${product.id}* to order now!\n` +
              `⚠️ Limited stock — order fast! 🚀`
            );
            sent++;
            await new Promise(r=>setTimeout(r,300));
          } catch {}
        }
        waitlist[product.id] = [];
        await sendMsg(from, `✅ ${product.name} marked in stock!\n${sent} customers notified from waitlist.`);
      } else await sendMsg(from, `❌ Product not found: ${productName}`);
      return;
    }

    if (msg.startsWith("!coupon ")) {
      const parts  = rawMsg.slice(8).split("|");
      const code   = parts[0]?.trim().toUpperCase();
      const discount = parseFloat(parts[1]?.trim());
      const type   = parts[2]?.trim() || "percent";
      const expiry = parts[3]?.trim() || null;
      coupons[code] = { discount, type, expiry, usedBy: [] };
      await sendMsg(from, `✅ Coupon created!\nCode: *${code}*\nDiscount: ${discount}${type==="percent"?"%":"$"}\n${expiry?`Expires: ${expiry}`:""}`); return;
    }

    if (msg === "!topbuyers") {
      const sorted = Object.entries(customers)
        .filter(([,c]) => c.name && c.totalSpend > 0)
        .sort((a,b) => b[1].totalSpend - a[1].totalSpend)
        .slice(0,5);
      let txt = `👑 *Top Buyers — ${SETTINGS.storeName}*\n\n`;
      sorted.forEach(([,c],i) => {
        txt += `${["🥇","🥈","🥉","4️⃣","5️⃣"][i]} ${c.name} — $${c.totalSpend.toFixed(2)}\n`;
      });
      await sendMsg(from, txt || "No purchase data yet."); return;
    }

    if (msg === "!revenue") {
      const totalRev = Object.values(orders).reduce((a,o)=>a+(parseFloat(o.total)||0),0);
      const todayRev = Object.values(orders)
        .filter(o=>new Date(o.createdAt).toDateString()===new Date().toDateString())
        .reduce((a,o)=>a+(parseFloat(o.total)||0),0);
      await sendMsg(from,
        `💰 *Revenue Dashboard — ${SETTINGS.storeName}*\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `💵 Total Revenue: *$${totalRev.toFixed(2)}*\n` +
        `📅 Today: *$${todayRev.toFixed(2)}*\n` +
        `📦 Total Orders: ${Object.keys(orders).length}\n` +
        `👥 Customers: ${Object.keys(customers).length}\n` +
        `💎 VIP Members: ${Object.values(customers).filter(c=>c.tier==="VIP").length}\n` +
        `🛒 Active Carts: ${Object.keys(carts).length}\n` +
        `↩️ Returns: ${Object.keys(returns).length}`
      ); return;
    }

    if (msg.startsWith("!segment vip")) {
      const text = rawMsg.slice(12).trim();
      const vips = Object.keys(customers).filter(p=>customers[p].tier==="VIP");
      let sent = 0;
      for (const phone of vips) {
        try {
          await sendMsg(phone, `💎 *VIP Exclusive — ${SETTINGS.storeName}*\n\n${text}`);
          sent++; await new Promise(r=>setTimeout(r,300));
        } catch {}
      }
      await sendMsg(from, `✅ VIP message sent to *${sent}* VIP members!`); return;
    }

    if (msg.startsWith("!updateorder ")) {
      const parts = rawMsg.slice(13).split("|");
      const id = parts[0]?.trim().toUpperCase(), status = parts[1]?.trim();
      if (orders[id]) {
        orders[id].status = status;
        try {
          await sendMsg(orders[id].phone,
            `📦 *Order Update #${id}*\n\n` +
            `Status: *${status}*\n\n` +
            `Thank you for shopping with ${SETTINGS.storeName}! 🙏`
          );
        } catch {}
        await sendMsg(from, `✅ Order #${id} updated to: ${status}`);
      } else await sendMsg(from, `❌ Order ${id} not found.`);
      return;
    }

    if (msg === "!stats") {
      const totalRev = Object.values(orders).reduce((a,o)=>a+(parseFloat(o.total)||0),0);
      await sendMsg(from,
        `📊 *Stats — ${SETTINGS.storeName}*\n\n` +
        `💰 Revenue: $${totalRev.toFixed(2)}\n` +
        `📦 Orders: ${Object.keys(orders).length}\n` +
        `👥 Customers: ${Object.keys(customers).length}\n` +
        `💎 VIPs: ${Object.values(customers).filter(c=>c.tier==="VIP").length}\n` +
        `🛒 Carts: ${Object.keys(carts).length}\n` +
        `↩️ Returns: ${Object.keys(returns).length}\n` +
        `⭐ Reviews: ${Object.values(reviews).flat().length}`
      ); return;
    }
  }

  // ── ACTIVE SESSION ──────────────────────────────────────────
  if (sessions[from]) { await handleSession(from, rawMsg); return; }

  // ── GREETINGS ───────────────────────────────────────────────
  const greetings = ["hi","hello","hey","start","help","menu"];
  if (greetings.includes(msg)) {
    if (!customer.name) {
      sessions[from] = { step: "reg_name", data: {} };
      await sendMsg(from,
        `🛍️ *Welcome to ${SETTINGS.storeName}!*\n\n` +
        `Let me personalise your experience!\n\n` +
        `What is your *first name*?`
      );
    } else {
      await sendMsg(from, mainMenu(customer));
    }
    return;
  }

  // ── SHOP ────────────────────────────────────────────────────
  if (msg === "shop" || msg === "1" || msg.startsWith("shop ")) {
    if (msg === "shop" || msg === "1") {
      await sendMsg(from,
        `🛍️ *Shop by Category*\n\n` +
        `1️⃣ *shop clothing*\n` +
        `2️⃣ *shop accessories*\n` +
        `3️⃣ *shop electronics*\n` +
        `4️⃣ *shop fitness*\n` +
        `5️⃣ *shop all*\n\n` +
        `💡 Buy 2 = 10% off | Buy 3 = 20% off!`
      ); return;
    }
    const cat = rawMsg.slice(5).trim();
    await sendMsg(from, formatProducts(cat === "all" ? null : cat)); return;
  }

  // ── TRACK ORDER ─────────────────────────────────────────────
  if (msg === "track" || msg === "2" || msg.startsWith("track ")) {
    if (msg === "track" || msg === "2") {
      await sendMsg(from, `📦 Usage: *track [order ID]*\nExample: track ORD12345`); return;
    }
    const id    = rawMsg.slice(6).trim().toUpperCase();
    const order = orders[id];
    if (order) {
      await sendMsg(from,
        `📦 *Order #${id}*\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `📋 Status: *${order.status}*\n` +
        `📦 Items: ${order.items?.join(", ")}\n` +
        `💰 Total: $${order.total}\n` +
        `📍 Address: ${order.address || "Pickup"}\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `Questions? Type *contact*`
      );
    } else await sendMsg(from, `❌ Order *${id}* not found.\n\nCheck your confirmation message for the correct ID.`);
    return;
  }

  // ── BUY ─────────────────────────────────────────────────────
  if (msg.startsWith("buy ") || msg === "buy" || msg === "3") {
    if (msg === "buy" || msg === "3") {
      sessions[from] = { step: "buy_browse", data: {} };
      await sendMsg(from, formatProducts()); return;
    }
    const pid     = rawMsg.slice(4).trim().toUpperCase();
    const product = PRODUCTS.find(p => p.id === pid);
    if (!product) { await sendMsg(from, `❌ Product *${pid}* not found.\n\nType *shop* to browse.`); return; }
    if (!product.stock) {
      if (!waitlist[pid]) waitlist[pid] = [];
      if (!waitlist[pid].includes(from)) waitlist[pid].push(from);
      if (!wishlists[from]) wishlists[from] = [];
      if (!wishlists[from].includes(pid)) wishlists[from].push(pid);
      await sendMsg(from,
        `😔 *${product.name}* is out of stock.\n\n` +
        `✅ Added to your wishlist!\n` +
        `🔔 You will be notified when it is back in stock.\n\n` +
        `Type *wishlist* to see your saved items.`
      ); return;
    }
    // Update cart
    if (!carts[from]) carts[from] = { items: [], lastActive: Date.now() };
    carts[from].items = [`${product.name} ($${product.price})`];
    carts[from].lastActive = Date.now();
    carts[from].recovered = false;

    sessions[from] = { step: "buy_qty", data: { product } };
    await sendMsg(from,
      `🛒 *${product.name}*\n` +
      `💰 $${product.price}\n` +
      `📝 ${product.desc}\n\n` +
      `How many? (1-10)\n\n` +
      `💡 Buy 2 = 10% off | Buy 3 = 20% off!`
    ); return;
  }

  // ── CURRENCY CONVERT ─────────────────────────────────────────
  if (msg.startsWith("convert") || msg === "4") {
    if (msg === "4" || msg === "convert") {
      await sendMsg(from,
        `💱 *Currency Converter*\n\n` +
        `Usage: *convert [amount] [from] [to]*\n\n` +
        `Examples:\n• convert 100 USD GBP\n• convert 50 GBP USD\n• convert 200 EUR USD\n\n` +
        `Supported: USD GBP EUR CAD AUD JPY PKR INR AED`
      ); return;
    }
    const parts  = rawMsg.split(" ").filter(Boolean);
    const amount = parseFloat(parts[1]);
    const from_c = parts[2]?.toUpperCase();
    const to_c   = parts[3]?.toUpperCase() || "USD";
    if (!amount || !from_c) { await sendMsg(from, `❌ Usage: *convert 100 USD GBP*`); return; }
    const rates = await getLiveRates();
    if (rates && rates[from_c] && rates[to_c]) {
      const converted = ((amount/rates[from_c])*rates[to_c]).toFixed(2);
      await sendMsg(from, `💱 ${amount} ${from_c} = *${converted} ${to_c}*\nRate: 1 ${from_c} = ${(rates[to_c]/rates[from_c]).toFixed(4)} ${to_c}\n\n🛍️ Shop: ${SETTINGS.storeUrl}`);
    } else await sendMsg(from, `❌ Currency not supported.`);
    return;
  }

  // ── DEALS ────────────────────────────────────────────────────
  if (msg === "deals" || msg === "5" || msg.includes("discount") || msg.includes("sale")) {
    const isVIP = customer.tier === "VIP";
    await sendMsg(from,
      `🔥 *Today's Deals — ${SETTINGS.storeName}*\n` +
      `━━━━━━━━━━━━━━━━━━━\n\n` +
      `⚡ 20% OFF Electronics — Code: *TECH20*\n\n` +
      `🎁 Buy 2 Get 10% OFF — Auto-applied\n\n` +
      `🚚 FREE Shipping on $50+\n\n` +
      (isVIP ? `💎 *VIP Exclusive:* 15% OFF Everything\nCode: *VIP15*\n\n` : `💎 Spend $${SETTINGS.vipThreshold} total to unlock VIP!\n\n`) +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `Type *shop* to browse! 🛍️`
    ); return;
  }

  // ── RETURN ───────────────────────────────────────────────────
  if (msg === "return" || msg === "6" || msg.includes("refund") || msg.includes("exchange")) {
    sessions[from] = { step: "ret_order", data: {} };
    await sendMsg(from,
      `↩️ *Returns & Exchanges*\n\n` +
      `We offer *30-day hassle-free returns!*\n\n` +
      `What is your *order ID*?\n\nExample: ORD12345`
    ); return;
  }

  // ── WISHLIST ─────────────────────────────────────────────────
  if (msg === "wishlist" || msg === "7") {
    const list = wishlists[from];
    if (!list?.length) {
      await sendMsg(from, `💝 Your wishlist is empty.\n\nType *shop* to browse products!\n\nItems you try to buy when out of stock are auto-saved here.`);
    } else {
      const items = list.map(pid => {
        const p = PRODUCTS.find(x => x.id === pid);
        return p ? `${p.stock?"✅":"❌"} ${p.name} — $${p.price} (${p.id})` : null;
      }).filter(Boolean);
      await sendMsg(from,
        `💝 *Your Wishlist*\n━━━━━━━━━━━━━━━━━━━\n\n` +
        items.join("\n") +
        `\n\n━━━━━━━━━━━━━━━━━━━\n` +
        `✅ = In stock now!\n` +
        `Type *buy [ID]* to order available items.`
      );
    }
    return;
  }

  // ── LOYALTY ──────────────────────────────────────────────────
  if (msg === "loyalty" || msg === "8" || msg.includes("points") || msg.includes("cashback")) {
    const spendToVIP = Math.max(0, SETTINGS.vipThreshold - customer.totalSpend).toFixed(2);
    await sendMsg(from,
      `💎 *Your Loyalty Account*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `👤 ${customer.name || "Guest"}\n` +
      `🏆 Tier: *${customer.tier}*\n` +
      `⭐ Points: *${customer.points}*\n` +
      `💰 Cashback: *$${customer.cashback?.toFixed(2) || "0.00"}*\n` +
      `💵 Total Spent: *$${customer.totalSpend?.toFixed(2) || "0.00"}*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      (customer.tier !== "VIP" ? `⬆️ Spend *$${spendToVIP}* more to unlock VIP!\n\n` : `💎 You are a VIP member! Enjoy your perks!\n\n`) +
      `*How to earn:*\n` +
      `• 1 point per $1 spent\n` +
      `• ${SETTINGS.cashbackRate}% cashback on every order\n` +
      `• 50 points for leaving a review\n` +
      `• 25 points per referral\n\n` +
      `Your referral code: *${customer.referralCode}*`
    ); return;
  }

  // ── REFER ────────────────────────────────────────────────────
  if (msg === "refer" || msg === "9" || msg.includes("refer")) {
    await sendMsg(from,
      `🎁 *Refer a Friend*\n` +
      `━━━━━━━━━━━━━━━━━━━\n\n` +
      `Share your code with friends!\n\n` +
      `🏷️ Your code: *${customer.referralCode}*\n\n` +
      `When they order with your code:\n` +
      `✅ They get *$10 OFF* their first order\n` +
      `✅ You get *25 loyalty points*\n\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `Share: "Shop at ${SETTINGS.storeName} and use my code *${customer.referralCode}* for $10 off your first order! 🛍️"`
    ); return;
  }

  // ── REORDER ──────────────────────────────────────────────────
  if (msg === "reorder" || msg === "10") {
    if (!customer.orders?.length) { await sendMsg(from, `❌ No previous orders found.\n\nType *shop* to browse products!`); return; }
    const lastOrderId = customer.orders[customer.orders.length-1];
    const lastOrder   = orders[lastOrderId];
    if (!lastOrder) { await sendMsg(from, `❌ Could not find your last order.`); return; }
    await sendMsg(from,
      `🔄 *Reorder — Last Order*\n\n` +
      `📦 Order #${lastOrderId}\n` +
      `🛒 Items: ${lastOrder.items?.join(", ")}\n` +
      `💰 Total: $${lastOrder.total}\n\n` +
      `Would you like to reorder this?\n\n` +
      `1️⃣ Yes — same items\n` +
      `2️⃣ No — browse new items`
    );
    sessions[from] = { step: "reorder_confirm", data: { lastOrder, lastOrderId } };
    return;
  }

  // ── RECOMMENDATIONS ───────────────────────────────────────────
  if (msg === "recommend" || msg.includes("recommend") || msg.includes("suggest")) {
    const recs = getRecommendations(from);
    let txt = `💡 *Recommended for You*\n━━━━━━━━━━━━━━━━━━━\n\n`;
    if (recs.length === 0) { await sendMsg(from, `💡 Type *shop* to browse all products!`); return; }
    recs.forEach(p => { txt += `✅ *${p.name}* — $${p.price}\n   ${p.desc}\n   Type: *buy ${p.id}*\n\n`; });
    txt += `━━━━━━━━━━━━━━━━━━━\n`;
    txt += `💡 Buy 2 = 10% off!`;
    await sendMsg(from, txt); return;
  }

  // ── REVIEW ───────────────────────────────────────────────────
  if (msg === "review" || msg.includes("review")) {
    sessions[from] = { step: "review_rating", data: {} };
    await sendMsg(from,
      `⭐ *Leave a Review*\n\n` +
      `Rate your experience:\n\n` +
      `1️⃣ ⭐ Poor\n2️⃣ ⭐⭐ Fair\n3️⃣ ⭐⭐⭐ Good\n` +
      `4️⃣ ⭐⭐⭐⭐ Great\n5️⃣ ⭐⭐⭐⭐⭐ Excellent!`
    ); return;
  }

  // ── SUBSCRIBE ────────────────────────────────────────────────
  if (msg === "subscribe") {
    await sendMsg(from,
      `🎉 *You are subscribed to ${SETTINGS.storeName}!*\n\n` +
      `You will receive:\n` +
      `• Weekly flash sales\n` +
      `• New arrivals alerts\n` +
      `• Exclusive discount codes\n\n` +
      `🎁 Welcome gift: *WELCOME10* for 10% OFF!\n\n` +
      `Type *unsubscribe* anytime to stop.`
    ); return;
  }

  // ── CONTACT ──────────────────────────────────────────────────
  if (msg === "contact" || msg === "12" || msg.includes("support") || msg.includes("help")) {
    await sendMsg(from,
      `💬 *${SETTINGS.storeName} Support*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `📧 ${SETTINGS.email}\n` +
      `📱 ${SETTINGS.phone}\n` +
      `🌐 ${SETTINGS.storeUrl}\n` +
      `📸 ${SETTINGS.instagram}\n\n` +
      `⏰ Mon–Fri 9am–6pm EST\n` +
      `⚡ We reply within 2 hours!`
    ); return;
  }

  // ── USE REFERRAL CODE ─────────────────────────────────────────
  if (msg.startsWith("shop-")) {
    const code = rawMsg.toUpperCase();
    if (referrals[code] && referrals[code] !== from && !customer.referredBy) {
      customer.referredBy = code;
      customers[referrals[code]].points = (customers[referrals[code]].points||0) + 25;
      await sendMsg(from, `🎉 Code *${code}* applied!\n✅ $10 OFF your first order!\nCode: *REFER10*`);
      try { await sendMsg(referrals[code], `🎉 Your referral was used!\n✅ You earned *25 loyalty points!*`); } catch {}
    } else await sendMsg(from, `❌ Invalid or already used referral code.`);
    return;
  }

  await sendMsg(from, mainMenu(customer));
});

// ============================================================
//  SESSION HANDLER
// ============================================================
async function handleSession(from, raw) {
  const s        = sessions[from];
  const msg      = raw.toLowerCase().trim();
  const customer = getOrCreateCustomer(from);

  // ── REGISTRATION ─────────────────────────────────────────────
  if (s.step === "reg_name") {
    customer.name = raw;
    s.step = "reg_birthday";
    await sendMsg(from, `Nice to meet you *${raw}*! 🛍️\n\nYour *birthday* (DD-MM) for special discounts?\n\nExample: 25-12\nOr type *skip*`); return;
  }
  if (s.step === "reg_birthday") {
    customer.birthday = msg === "skip" ? null : raw.trim();
    await sendMsg(from,
      `🎉 *Welcome, ${customer.name}!*\n\n` +
      (customer.birthday ? `🎂 Birthday saved! Expect a special gift! 🎁\n\n` : "") +
      `🎁 Welcome gift: Use *WELCOME10* for 10% OFF!\n\n` +
      mainMenu(customer)
    );
    delete sessions[from]; return;
  }

  // ── BUY FLOW ─────────────────────────────────────────────────
  if (s.step === "buy_browse") {
    const pid     = raw.toUpperCase();
    const product = PRODUCTS.find(p => p.id === pid);
    if (!product) { await sendMsg(from, `❌ Enter a valid product ID or type *cancel*.`); return; }
    if (!product.stock) {
      if (!waitlist[pid]) waitlist[pid] = [];
      if (!waitlist[pid].includes(from)) waitlist[pid].push(from);
      await sendMsg(from, `😔 Out of stock. Added to waitlist! 🔔`);
      delete sessions[from]; return;
    }
    s.data.product = product; s.step = "buy_qty";
    await sendMsg(from, `🛒 *${product.name}* — $${product.price}\n\nHow many? (1-10)\n\n💡 Buy 2 = 10% off | Buy 3 = 20% off!`); return;
  }

  if (s.step === "buy_qty") {
    const qty = parseInt(raw);
    if (isNaN(qty)||qty<1||qty>10) { await sendMsg(from, `Enter a number 1-10.`); return; }
    s.data.qty = qty;
    const bundleDisc = getBundleDiscount(qty);
    const subtotal   = (s.data.product.price * qty * (1 - bundleDisc/100)).toFixed(2);
    s.data.subtotal  = subtotal;
    s.data.bundleDisc = bundleDisc;
    s.step = "buy_name";
    await sendMsg(from,
      `${qty}x ${s.data.product.name}\n` +
      (bundleDisc > 0 ? `🎁 Bundle discount: -${bundleDisc}%\n` : "") +
      `💰 Subtotal: *$${subtotal}*\n\n` +
      `Your *full name*?`
    ); return;
  }

  if (s.step === "buy_name")    { s.data.name=raw; s.step="buy_address"; await sendMsg(from, `👤 ${raw}\n\n*Delivery address?*\n\nStreet, City, State, Zip\n\nOr type *pickup* for store pickup.`); return; }
  if (s.step === "buy_address") {
    s.data.address = msg === "pickup" ? "Store Pickup" : raw;
    s.step = "buy_coupon";
    const shipping = parseFloat(s.data.subtotal) >= 50 || msg === "pickup" ? "FREE" : "$5.99";
    s.data.shipping = shipping;
    await sendMsg(from, `📍 ${s.data.address}\n🚚 Shipping: ${shipping}\n\nDo you have a *discount code?*\n\nOr type *none* to skip.`); return;
  }

  if (s.step === "buy_coupon") {
    const couponResult = msg === "none" ? { valid: false, discount:0, final: s.data.subtotal } : applyCoupon(raw, parseFloat(s.data.subtotal));
    s.data.coupon = msg === "none" ? null : raw.toUpperCase();
    s.data.couponDiscount = couponResult.discount;
    const shipping = s.data.shipping === "FREE" ? 0 : 5.99;
    s.data.grandTotal = (parseFloat(couponResult.final) + shipping).toFixed(2);
    s.step = "buy_confirm";
    await sendMsg(from,
      `📋 *Order Summary*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `🛒 ${s.data.qty}x ${s.data.product.name}\n` +
      (s.data.bundleDisc > 0 ? `💡 Bundle: -${s.data.bundleDisc}%\n` : "") +
      `💰 Subtotal: $${s.data.subtotal}\n` +
      (couponResult.valid ? `🏷️ Coupon (${s.data.coupon}): -$${s.data.couponDiscount}\n` : (s.data.coupon ? `❌ Invalid coupon\n` : "")) +
      `🚚 Shipping: ${s.data.shipping}\n` +
      `💵 *Total: $${s.data.grandTotal}*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `📍 ${s.data.address}\n\n` +
      `Type *confirm* or *cancel*`
    ); return;
  }

  if (s.step === "buy_confirm") {
    if (msg === "cancel") { delete sessions[from]; await sendMsg(from, `❌ Order cancelled.`); return; }
    if (msg !== "confirm") { await sendMsg(from, `Type *confirm* or *cancel*.`); return; }

    const id = `ORD${Date.now().toString().slice(-6)}`;
    orders[id] = {
      phone: from, name: s.data.name,
      items: [`${s.data.qty}x ${s.data.product.name}`],
      address: s.data.address, total: s.data.grandTotal,
      status: "Processing", createdAt: new Date().toISOString(),
    };

    // Update customer stats
    customer.orders = customer.orders || [];
    customer.orders.push(id);
    customer.totalSpend = (customer.totalSpend||0) + parseFloat(s.data.grandTotal);
    customer.points    = (customer.points||0) + Math.floor(parseFloat(s.data.grandTotal));
    const cashback      = parseFloat(s.data.grandTotal) * SETTINGS.cashbackRate / 100;
    customer.cashback  = (customer.cashback||0) + cashback;

    // Auto VIP upgrade
    if (customer.totalSpend >= SETTINGS.vipThreshold && customer.tier !== "VIP") {
      customer.tier = "VIP";
      setTimeout(async () => {
        try {
          await sendMsg(from,
            `💎 *Congratulations! You are now a VIP Member!*\n\n` +
            `You have spent $${customer.totalSpend.toFixed(2)} with us!\n\n` +
            `*Your VIP Benefits:*\n` +
            `✅ 15% OFF all future orders — Code: *VIP15*\n` +
            `✅ Free shipping always\n` +
            `✅ Early access to sales\n` +
            `✅ Priority support\n\n` +
            `Thank you for your loyalty! 💎`
          );
        } catch {}
      }, 2000);
    }

    // Clear cart
    delete carts[from];

    // Notify owner
    if (process.env.OWNER_PHONE) {
      try {
        await sendMsg(process.env.OWNER_PHONE,
          `🔥 *New Order #${id}!*\n\n` +
          `👤 ${s.data.name}\n` +
          `🛒 ${s.data.qty}x ${s.data.product.name}\n` +
          `💰 $${s.data.grandTotal}\n` +
          `📍 ${s.data.address}\n` +
          `📱 ${from}\n\n` +
          `Update: *!updateorder ${id} | Shipped*`
        );
      } catch {}
    }

    await sendMsg(from,
      `🎉 *Order Confirmed! #${id}*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `🛒 ${s.data.qty}x ${s.data.product.name}\n` +
      `💰 Total: $${s.data.grandTotal}\n` +
      `🚚 Est: 5-7 business days\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `⭐ Points earned: +${Math.floor(parseFloat(s.data.grandTotal))}\n` +
      `💰 Cashback: +$${cashback.toFixed(2)}\n\n` +
      `Type *track ${id}* to check status!\n` +
      `Type *review* after receiving to earn 50 bonus points! ⭐`
    );

    // Auto review request after 7 days
    setTimeout(async () => {
      try {
        await sendMsg(from,
          `📦 *How was your ${s.data.product.name}?*\n\n` +
          `We hope you love it! 😊\n\n` +
          `⭐ Leave a review and earn *50 bonus points!*\n\n` +
          `Type *review* to rate your purchase!`
        );
      } catch {}
    }, 7*24*60*60*1000);

    delete sessions[from]; return;
  }

  // ── REORDER CONFIRM ───────────────────────────────────────────
  if (s.step === "reorder_confirm") {
    if (msg === "2" || msg.includes("no")) { delete sessions[from]; await sendMsg(from, mainMenu(customer)); return; }
    if (msg === "1" || msg.includes("yes")) {
      sessions[from] = { step: "reorder_address", data: { lastOrder: s.data.lastOrder } };
      await sendMsg(from, `🔄 Reordering: *${s.data.lastOrder.items?.join(", ")}*\n\n*Delivery address?*\n\nOr type *same* for same address.`); return;
    }
    await sendMsg(from, `Type 1 for yes or 2 for no.`); return;
  }

  if (s.step === "reorder_address") {
    const address = msg === "same" ? s.data.lastOrder.address : raw;
    const id      = `ORD${Date.now().toString().slice(-6)}`;
    orders[id] = {
      phone: from, items: s.data.lastOrder.items,
      address, total: s.data.lastOrder.total,
      status: "Processing", createdAt: new Date().toISOString(),
    };
    customer.orders.push(id);
    if (process.env.OWNER_PHONE) {
      try { await sendMsg(process.env.OWNER_PHONE, `🔄 *Reorder #${id}!*\n\n🛒 ${s.data.lastOrder.items?.join(", ")}\n💰 $${s.data.lastOrder.total}\n📍 ${address}\n📱 ${from}`); } catch {}
    }
    await sendMsg(from,
      `✅ *Reorder Confirmed! #${id}*\n\n` +
      `🛒 ${s.data.lastOrder.items?.join(", ")}\n` +
      `💰 $${s.data.lastOrder.total}\n` +
      `🚚 5-7 business days\n\n` +
      `Type *track ${id}* to check status!`
    );
    delete sessions[from]; return;
  }

  // ── RETURN FLOW ───────────────────────────────────────────────
  if (s.step === "ret_order")  { s.data.orderId=raw.toUpperCase(); s.step="ret_reason"; await sendMsg(from, `Order: *${raw}*\n\nReason?\n1️⃣ Wrong size\n2️⃣ Damaged\n3️⃣ Not as described\n4️⃣ Changed my mind\n5️⃣ Wrong item`); return; }
  if (s.step === "ret_reason") {
    const reasons = {"1":"Wrong size","2":"Damaged","3":"Not as described","4":"Changed my mind","5":"Wrong item"};
    s.data.reason = reasons[msg]||raw; s.step="ret_type";
    await sendMsg(from, `Reason: *${s.data.reason}*\n\n1️⃣ Refund\n2️⃣ Exchange\n3️⃣ Store Credit`); return;
  }
  if (s.step === "ret_type") {
    const types = {"1":"Refund","2":"Exchange","3":"Store Credit"};
    const retType = types[msg]||raw;
    const id = `RET${Date.now().toString().slice(-5)}`;
    returns[id] = { ...s.data, phone:from, type:retType, status:"Pending", createdAt:new Date().toISOString() };
    if (process.env.OWNER_PHONE) { try { await sendMsg(process.env.OWNER_PHONE, `↩️ *Return #${id}*\n\nOrder: ${s.data.orderId}\nReason: ${s.data.reason}\nType: ${retType}\nPhone: ${from}`); } catch {} }
    await sendMsg(from,
      `✅ *Return Submitted! #${id}*\n\n` +
      `Order: ${s.data.orderId}\nReason: ${s.data.reason}\nResolution: ${retType}\n\n` +
      `We will contact you within 24 hours!`
    );
    delete sessions[from]; return;
  }

  // ── REVIEW FLOW ───────────────────────────────────────────────
  if (s.step === "review_rating") {
    const rating = parseInt(msg);
    if (isNaN(rating)||rating<1||rating>5) { await sendMsg(from, "Choose 1-5."); return; }
    s.data.rating = rating; s.step = "review_comment";
    await sendMsg(from, `${"⭐".repeat(rating)} Thanks!\n\nTell us more about your experience:`); return;
  }
  if (s.step === "review_comment") {
    if (!reviews[from]) reviews[from] = [];
    reviews[from].push({ rating: s.data.rating, comment: raw, date: new Date().toISOString() });
    customer.points = (customer.points||0) + 50;
    if (process.env.OWNER_PHONE) { try { await sendMsg(process.env.OWNER_PHONE, `⭐ *Review — ${SETTINGS.storeName}*\n\nRating: ${"⭐".repeat(s.data.rating)}\nComment: ${raw}\nFrom: ${from}`); } catch {} }
    await sendMsg(from,
      `🙏 *Thank you for your review!*\n\n` +
      `${"⭐".repeat(s.data.rating)}\n\n` +
      `✅ You earned *50 bonus points!*\n` +
      `💎 Total points: ${customer.points}\n\n` +
      (s.data.rating >= 4 ? `⭐ Leave a public review:\nGoogle: ${SETTINGS.googleReview}\nTrustpilot: ${SETTINGS.trustpilot}` : `We are sorry it was not perfect. We will do better! 🙏`)
    );
    delete sessions[from]; return;
  }

  delete sessions[from];
  await sendMsg(from, mainMenu(customer));
}

// ============================================================
//  HEALTH CHECK
// ============================================================
app.get("/", (req, res) => {
  const totalRev = Object.values(orders).reduce((a,o)=>a+(parseFloat(o.total)||0),0);
  res.json({
    status:    "running",
    store:     SETTINGS.storeName,
    customers: Object.keys(customers).length,
    orders:    Object.keys(orders).length,
    revenue:   "$"+totalRev.toFixed(2),
    vips:      Object.values(customers).filter(c=>c.tier==="VIP").length,
    uptime:    process.uptime().toFixed(0)+"s",
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🛍️ ${SETTINGS.storeName} Bot V2 running on port ${PORT}`);
  console.log(`Webhook: http://localhost:${PORT}/webhook\n`);
});
