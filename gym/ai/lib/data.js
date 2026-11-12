// Data extracted verbatim from src/original-index.js (FitLife Gym demo data).
// Do NOT edit prices/names here — replace only when onboarding a real client.
const WORKOUTS = {
  beginner: {
    chest:    ["3x10 Push-ups", "3x12 Dumbbell Flyes", "3x15 Wall Push-ups", "2x10 Incline Push-ups"],
    back:     ["3x10 Bodyweight Rows", "3x12 Superman Hold", "3x15 Band Pulldowns", "2x10 Reverse Snow Angels"],
    legs:     ["3x15 Bodyweight Squats", "3x12 Lunges", "3x20 Calf Raises", "3x10 Glute Bridges"],
    arms:     ["3x12 Bicep Curls", "3x15 Tricep Dips", "3x10 Hammer Curls", "2x12 Overhead Extensions"],
    core:     ["3x30sec Plank", "3x15 Crunches", "3x10 Leg Raises", "3x20 Bicycle Crunches"],
    cardio:   ["20min Walk", "10min Jump Rope", "15min Cycling", "3x1min High Knees + 1min Rest"],
    fullbody: ["3x10 Squats", "3x10 Push-ups", "3x10 Rows", "3x30sec Plank", "3x15 Lunges"],
    shoulders:["3x12 Shoulder Press", "3x15 Lateral Raises", "3x12 Front Raises", "3x15 Face Pulls"],
    glutes:   ["4x15 Glute Bridges", "3x12 Donkey Kicks", "3x15 Clamshells", "3x12 Side Steps Band"],
  },
  intermediate: {
    chest:    ["4x10 Bench Press", "3x12 Incline DB Press", "3x15 Cable Flyes", "3x10 Dips"],
    back:     ["4x8 Pull-ups", "4x10 Barbell Rows", "3x12 Seated Cable Rows", "3x10 Face Pulls"],
    legs:     ["4x8 Barbell Squats", "3x10 Romanian Deadlift", "3x12 Leg Press", "4x15 Leg Curls"],
    arms:     ["4x10 Barbell Curls", "4x10 Skull Crushers", "3x12 Preacher Curls", "3x12 Rope Pushdowns"],
    core:     ["4x45sec Plank", "3x20 Ab Wheel Rollouts", "3x15 Hanging Knee Raises", "3x20 Russian Twists"],
    cardio:   ["30min Run", "20min HIIT (30sec on/30sec off)", "45min Cycling", "3x400m Sprints"],
    fullbody: ["4x8 Deadlifts", "4x10 Bench Press", "4x8 Squats", "3x10 Pull-ups", "3x12 OHP"],
    shoulders:["4x10 Military Press", "3x12 Arnold Press", "4x15 Cable Lateral Raises", "3x12 Rear Delt Flyes"],
    glutes:   ["4x12 Hip Thrusts", "3x10 Bulgarian Split Squats", "4x15 Cable Kickbacks", "3x12 Sumo Squats"],
  },
  advanced: {
    chest:    ["5x5 Bench Press", "4x8 Weighted Dips", "4x10 Cable Crossovers", "3x12 Incline DB Press"],
    back:     ["5x5 Weighted Pull-ups", "4x6 Barbell Rows", "4x8 T-Bar Rows", "3x10 Meadows Row"],
    legs:     ["5x5 Squats", "4x8 Front Squats", "4x10 Hack Squats", "4x12 Bulgarian Split Squats"],
    arms:     ["4x8 21s Barbell Curls", "4x10 Close-grip Bench", "3x12 Concentration Curls", "3x10 Overhead Ext"],
    core:     ["5x60sec Plank", "4x15 Dragon Flags", "4x20 Hanging Leg Raises", "3x20 Cable Crunches"],
    cardio:   ["45min Run", "25min HIIT Intervals", "10km Bike + 3km Run", "Tabata 8 rounds"],
    fullbody: ["5x5 Deadlift", "5x5 Bench", "5x5 Squat", "4x8 OHP", "4x10 Pull-ups"],
    shoulders:["5x5 Overhead Press", "4x10 Push Press", "4x12 Upright Rows", "3x15 Cable Face Pulls"],
    glutes:   ["5x8 Barbell Hip Thrusts", "4x10 Deficit Bulgarian Split Squats", "4x12 Single Leg Press", "3x15 Banded Clamshells"],
  },
};

const CALORIES = {
  chicken:      { cal: 165, protein: 31, carbs: 0,   fat: 3.6 },
  rice:         { cal: 130, protein: 2.7,carbs: 28,  fat: 0.3 },
  egg:          { cal: 155, protein: 13, carbs: 1.1, fat: 11  },
  banana:       { cal: 89,  protein: 1.1,carbs: 23,  fat: 0.3 },
  oats:         { cal: 389, protein: 17, carbs: 66,  fat: 7   },
  salmon:       { cal: 208, protein: 20, carbs: 0,   fat: 13  },
  beef:         { cal: 250, protein: 26, carbs: 0,   fat: 15  },
  broccoli:     { cal: 34,  protein: 2.8,carbs: 7,   fat: 0.4 },
  milk:         { cal: 61,  protein: 3.2,carbs: 4.8, fat: 3.3 },
  bread:        { cal: 265, protein: 9,  carbs: 49,  fat: 3.2 },
  pasta:        { cal: 131, protein: 5,  carbs: 25,  fat: 1.1 },
  tuna:         { cal: 132, protein: 28, carbs: 0,   fat: 1.3 },
  potato:       { cal: 77,  protein: 2,  carbs: 17,  fat: 0.1 },
  apple:        { cal: 52,  protein: 0.3,carbs: 14,  fat: 0.2 },
  yogurt:       { cal: 59,  protein: 10, carbs: 3.6, fat: 0.4 },
  peanutbutter: { cal: 588, protein: 25, carbs: 20,  fat: 50  },
  almonds:      { cal: 579, protein: 21, carbs: 22,  fat: 50  },
  sweetpotato:  { cal: 86,  protein: 1.6,carbs: 20,  fat: 0.1 },
  wheyprotein:  { cal: 120, protein: 24, carbs: 3,   fat: 2   },
  avocado:      { cal: 160, protein: 2,  carbs: 9,   fat: 15  },
};

const CLASSES_INITIAL = [
  { name: "HIIT Blast",             days: "Mon/Wed/Fri", time: "6:00 AM",  trainer: "Coach Mike", spots: 12 },
  { name: "Yoga Flow",              days: "Tue/Thu",     time: "7:00 AM",  trainer: "Coach Sarah", spots: 15 },
  { name: "Spin Cycle",             days: "Mon/Wed/Fri", time: "7:00 AM",  trainer: "Coach Mike", spots: 10 },
  { name: "Strength & Conditioning",days: "Tue/Thu/Sat", time: "9:00 AM",  trainer: "Coach Mike", spots: 8  },
  { name: "Pilates Core",           days: "Mon/Wed",     time: "10:00 AM", trainer: "Coach Sarah", spots: 12 },
  { name: "Boxing Fundamentals",    days: "Tue/Thu/Sat", time: "6:00 PM",  trainer: "Coach Mike", spots: 10 },
  { name: "Zumba Dance",            days: "Fri/Sat",     time: "5:00 PM",  trainer: "Coach Sarah", spots: 20 },
  { name: "CrossFit",               days: "Mon/Wed/Fri", time: "5:00 PM",  trainer: "Coach Mike", spots: 10 },
  { name: "Meditation & Stretch",   days: "Sun",         time: "9:00 AM",  trainer: "Coach Sarah", spots: 20 },
];

const MEAL_PLANS = {
  weightloss: `🥗 *Weight Loss Meal Plan*\n\n*Breakfast:* Oats + banana + black coffee (350 kcal)\n*Snack:* Apple + 10 almonds (150 kcal)\n*Lunch:* Grilled chicken + broccoli + brown rice (450 kcal)\n*Snack:* Greek yogurt + berries (120 kcal)\n*Dinner:* Salmon + sweet potato + salad (400 kcal)\n\n📊 Total: ~1,470 kcal/day\n💧 Drink 3L water daily\n🚫 Avoid: sugar, white bread, fried food\n⏱️ Eat every 3-4 hours`,
  musclegain: `💪 *Muscle Gain Meal Plan*\n\n*Breakfast:* 4 eggs + oats + milk (550 kcal)\n*Snack:* Peanut butter sandwich + banana (400 kcal)\n*Lunch:* 200g beef + 2 cups rice + veggies (700 kcal)\n*Pre-workout:* Banana + whey protein shake (250 kcal)\n*Post-workout:* Whey protein + banana (250 kcal)\n*Dinner:* Chicken breast + pasta + salad (550 kcal)\n\n📊 Total: ~2,700 kcal/day\n💧 Drink 4L water daily\n✅ Aim for 1g protein per lb bodyweight`,
  maintenance:`⚖️ *Maintenance Meal Plan*\n\n*Breakfast:* Eggs + whole grain toast + fruit (400 kcal)\n*Snack:* Yogurt + nuts (200 kcal)\n*Lunch:* Lean protein + complex carbs + veggies (500 kcal)\n*Snack:* Fruit + protein bar (200 kcal)\n*Dinner:* Fish + vegetables + rice (450 kcal)\n\n📊 Total: ~1,750 kcal/day\n💧 Drink 2.5L water daily\n✅ Balance: 40% carbs, 30% protein, 30% fat`,
};

const QUOTES = [
  "💪 *'The only bad workout is the one that didn't happen.'*",
  "🔥 *'Push yourself because no one else is going to do it for you.'*",
  "⚡ *'Success starts with self-discipline.'*",
  "🏆 *'Don't limit your challenges. Challenge your limits.'*",
  "💥 *'Your body can stand almost anything. It is your mind you have to convince.'*",
  "🎯 *'The pain you feel today will be the strength you feel tomorrow.'*",
  "🌟 *'Wake up. Work out. Look hot. Kick ass. Repeat.'*",
  "🚀 *'It never gets easier. You just get stronger.'*",
  "💎 *'Fitness is not about being better than someone else. It is about being better than you used to be.'*",
  "🦁 *'Train insane or remain the same.'*",
  "🔑 *'Believe in yourself and all that you are. Know there is something inside you that is greater than any obstacle.'*",
  "🌊 *'The hardest lift of all is lifting your butt off the couch.'*",
];

module.exports = { WORKOUTS, CALORIES, CLASSES: CLASSES_INITIAL, MEAL_PLANS, QUOTES };
