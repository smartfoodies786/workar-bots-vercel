# 🏫 School WhatsApp Communication Bot

## Languages: English + Arabic
## Markets: Pakistan, UAE, UK, Saudi Arabia, Nigeria, South Africa

---

## What this bot does

Replaces paper slips, phone calls, and chaotic WhatsApp groups.
One WhatsApp number for the whole school.
Principal sends one command — hundreds of parents notified instantly.

---

## How parents join

Parent messages the school WhatsApp number → types "hi" → chooses language → registers name, child name, class → done.

From that moment they receive ALL school notifications automatically.

---

## Principal commands — full list

### Announcements
```
!announce School will be closed on Friday for National Day
!announceclass 5A Dear parents, please bring PE kit tomorrow
```

### Attendance
```
!absent 5A Ahmed Khan          — marks absent, notifies parent
!late 5A Sara Ali              — marks late, notifies parent
!allpresent 5A                 — marks whole class present
```

### Academic Results
```
!result 5A Ahmed Khan | Math | 85
!result 5A Ahmed Khan | Math | 85 | Excellent improvement!
```
Format: !result [Class] [Student Name] | [Subject] | [Score] | [Optional comment]

### Homework
```
!homework 5A Math | Complete exercises 1-10 on page 45 | Tomorrow
!homework KG Art | Draw your favourite animal | Friday
```
Format: !homework [Class] [Subject] | [Task] | [Due Date]

### Fees
```
!feepaid 5A Ahmed Khan | 500 | January
```
Sends payment confirmation to parent instantly.

### Events
```
!event Sports Day | 15th March | All parents welcome to attend
!event Parent-Teacher Meeting | 20th March | Please bring your child's report card
```

### Awards & Achievements
```
!award 5A Ahmed Khan | Star Student of the Week
!award 3B Sara Ali | Best Science Project
```
Notifies the WHOLE CLASS — creates community pride.

### Health Alerts
```
!sick 5A Ahmed Khan
```
Sends urgent message to Ahmed's parent to collect him.

### Bus Notifications
```
!bus departed | 20 minutes
!bus departed | 15 minutes
```
Sends to ALL parents immediately.

### School Closure
```
!holiday National Day
!holiday Weather Advisory
!reopen
```

### Class Management
```
!addclass 6A Ms. Jennifer | 800
```
Format: !addclass [CLASS] [Teacher Name] | [Monthly Fee]

### Reports
```
!stats        — full dashboard
!help         — all commands list
```

---

## What parents can do

| Command | What happens |
|---------|-------------|
| hi / مرحبا | Register or see main menu |
| attendance / حضور | See today's attendance |
| fees / رسوم | See fee status and history |
| results / نتائج | See all test results |
| homework / واجبات | See today's homework |
| events / فعاليات | See upcoming events |
| contact / تواصل | Get school contact info |
| arabic | Switch to Arabic |
| english | Switch to English |
| ? [question] | Send question to principal |

---

## Automatic messages (no action needed)

| When | What happens |
|------|-------------|
| Every morning 8am (Mon-Sat) | Principal gets attendance reminder |
| 3 days before fee due date | All parents get fee reminder |
| Every Monday 7am | Principal gets weekly summary |

---

## Language support

Every parent chooses their language at registration.
English parents get English messages.
Arabic parents get Arabic messages.
Same commands work for both — bot detects automatically.

Parents can switch any time:
- Type *arabic* to switch to Arabic
- Type *english* to switch to English

---

## Pricing guide by country

| Country | Small School (under 200) | Medium (200-500) | Large (500+) |
|---------|--------------------------|-----------------|--------------|
| Pakistan | Rs 5,000/mo | Rs 10,000/mo | Rs 20,000/mo |
| UAE | AED 300/mo | AED 700/mo | AED 1,200/mo |
| UK | £75/mo | £150/mo | £300/mo |
| Saudi Arabia | SAR 400/mo | SAR 800/mo | SAR 1,500/mo |
| Nigeria | $30/mo | $60/mo | $100/mo |
| South Africa | $40/mo | $80/mo | $150/mo |

---

## Why schools buy this

1. No more paper slips that get lost
2. No more calling 200 parents one by one
3. No more chaotic WhatsApp groups
4. Parents receive info in their own language
5. Fee payment confirmation is instant
6. Absent child alert takes 10 seconds
7. Sick child emergency takes 5 seconds
8. Homework never gets forgotten

---

## Setup per school (10 minutes)

1. Copy .env.example to .env
2. Fill in school name, phone, address, principal name
3. Set OWNER_PHONE to principal's WhatsApp number
4. Set CURRENCY to local currency (USD, AED, GBP, PKR, SAR)
5. Add classes in CLASSES object in index.js (or use !addclass command)
6. Deploy to Railway
7. Set Twilio webhook to Railway URL
8. Principal joins WhatsApp sandbox
9. Share school number with parents
10. Done!

---

## Sales pitch — one liner per market

Pakistan:
"بھیجیں اعلان، لاکھوں کی بچت — صرف ایک WhatsApp پر"
"Send notices to all parents instantly — no paper slips needed"

UAE:
"Replace paper slips with instant WhatsApp notifications — in English and Arabic"

UK:
"Parents get attendance, results, and homework updates instantly on WhatsApp"

Saudi Arabia:
"أرسل الإشعارات لجميع أولياء الأمور فوراً — بالعربية والإنجليزية"

Nigeria:
"Notify all parents instantly on WhatsApp — no calling, no paper"

---

## Install and run

npm install
cp .env.example .env
# Fill in your details
npm start

Deploy:
railway login
railway init
railway up
