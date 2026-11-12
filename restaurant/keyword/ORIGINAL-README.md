# 🍴 Restaurant WhatsApp Bot V2 — Full & Final

## All 23 Features Included

---

## NEW features in V2:

### Owner Self-Service Commands
| Command | Example | What it does |
|---------|---------|--------------|
| !special | !special Grilled Salmon \| $18.99 \| Fresh daily | Update today's special |
| !menu add | !menu add Lamb Chops \| $18.99 \| mains | Add new dish |
| !menu remove | !menu remove Pizza | Remove dish |
| !price | !price Burger \| $16.99 | Update price |
| !hours | !hours Mon-Sun 12pm-11pm | Update hours |
| !close today | !close today | Mark closed today |
| !open | !open | Reopen restaurant |
| !soldout | !soldout pizza | Mark item sold out |
| !wait | !wait 45 mins | Update wait time |
| !confirm | !confirm R12345 | Confirm reservation + notify customer |
| !order | !order ORD123 \| Ready for pickup | Update order status |
| !today | !today | See today's bookings and orders |
| !broadcast | !broadcast Happy hour 5-7pm! | Message all subscribers |
| !stats | !stats | Full stats dashboard |

### Customer Features
| Command | What it does |
|---------|--------------|
| menu | Full menu (auto-hides sold out items) |
| special | Today's special + live weather promo |
| reserve | Book table with confirmation + reminder |
| order | Takeaway or delivery with area check |
| loyalty | Check points and rewards |
| refer | Get referral code |
| REF-XXXXX | Use friend's referral code for 10% off |
| subscribe | Join VIP list with birthday registration |
| cancel R12345 | Cancel a reservation |
| 1-5 | Rate experience (auto-sent after visit) |

### Automatic Features (no action needed)
- 🕐 Reservation reminder 2 hours before booking
- 🎂 Birthday discount sent automatically on customer's birthday
- 📊 Weekly report sent to owner every Monday 8am
- 🎉 Weekly deals broadcast to all subscribers every Friday 9am
- 🌤️ Weather-based promos when customer checks special
- ⭐ Auto feedback request 2 hours after order/visit
- 🔄 Sold out items reset every midnight automatically
- 📈 Popular dish tracker — counts what customers ask about

### File Upload Menu Update
Owner sends an Excel file (menu.xlsx) to the bot WhatsApp number.
Bot reads it and updates menu, prices, hours, special automatically.
See MENU-UPDATE-TEMPLATE.txt for the format.

---

## Install & Run

```bash
cd restaurant-bot-v2
npm install
cp .env.example .env
# Fill in your details in .env
npm start
```

---

## Connect ngrok for testing

```bash
# Terminal 2
npx ngrok http 3000

# Paste URL in Twilio Sandbox settings:
# https://your-url.ngrok-free.app/webhook
```

---

## Deploy to Railway

```bash
railway login
railway init
railway up
```

Add all .env variables in Railway dashboard.

---

## Loyalty Points System

- Customer earns 1 point per reservation
- Customer earns 1 point per order
- When they reach LOYALTY_TARGET points = FREE meal
- Referral gives referrer 2 bonus points
- Referred customer gets 10% off first order

---

## Delivery Area Check

Set postcodes/zipcodes in .env:
```
DELIVERY_ZIPS=90001,90002,EC1A,EC2A
```

Bot automatically rejects orders outside these areas.
Leave empty to allow all areas.

---

## Per-client setup (2 minutes)

1. Copy .env.example → .env
2. Fill in restaurant details
3. Set OWNER_PHONE to restaurant owner's number
4. Deploy to Railway
5. Set Twilio webhook to Railway URL
6. Done!

---

## Pricing

This bot is worth $147-197/month to restaurants because of:
- Loyalty system (keeps customers coming back)
- Referral system (grows customer base automatically)
- Birthday discounts (personal touch)
- Auto reports (saves owner time)
- File upload updates (no need to call you)
- Auto reminders (reduces no-shows)
- Auto feedback (improves restaurant reputation)
