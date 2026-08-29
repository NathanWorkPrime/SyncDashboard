const DAYS_MAP = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function isSchedulerInActiveWindow(currentTime, config) {
  if (!config || !config.activeDays || config.activeDays.length === 0) {
    return false;
  }

  // 1. Day of Week Check
  const currentDayName = DAYS_MAP[currentTime.getDay()];
  if (!config.activeDays.includes(currentDayName)) {
    return false;
  }

  // 2. Time Window Check
  const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

  const [startH, startM] = config.startTime.split(':').map(Number);
  const [endH, endM] = config.endTime.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    // Standard range (e.g. 09:00 - 17:00)
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } else {
    // Overnight range (e.g. 22:00 - 06:00)
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }
}

// --- UNIT TESTS ---

const tests = [
  {
    name: "Standard active hours - inside window",
    time: new Date("2026-08-31T12:00:00"), // Monday 12:00
    config: { activeDays: ["Mon", "Tue"], startTime: "09:00", endTime: "17:00" },
    expected: true
  },
  {
    name: "Standard active hours - outside window (early)",
    time: new Date("2026-08-31T08:00:00"), // Monday 08:00
    config: { activeDays: ["Mon", "Tue"], startTime: "09:00", endTime: "17:00" },
    expected: false
  },
  {
    name: "Standard active hours - outside window (late)",
    time: new Date("2026-08-31T18:00:00"), // Monday 18:00
    config: { activeDays: ["Mon", "Tue"], startTime: "09:00", endTime: "17:00" },
    expected: false
  },
  {
    name: "Standard active hours - incorrect day",
    time: new Date("2026-09-02T12:00:00"), // Wednesday 12:00
    config: { activeDays: ["Mon", "Tue"], startTime: "09:00", endTime: "17:00" },
    expected: false
  },
  {
    name: "Overnight hours - inside window (late night)",
    time: new Date("2026-08-31T23:00:00"), // Monday 23:00
    config: { activeDays: ["Mon", "Tue"], startTime: "22:00", endTime: "06:00" },
    expected: true
  },
  {
    name: "Overnight hours - inside window (early morning)",
    time: new Date("2026-09-01T04:00:00"), // Tuesday 04:00
    config: { activeDays: ["Mon", "Tue"], startTime: "22:00", endTime: "06:00" },
    expected: true
  },
  {
    name: "Overnight hours - outside window (midday)",
    time: new Date("2026-08-31T12:00:00"), // Monday 12:00
    config: { activeDays: ["Mon", "Tue"], startTime: "22:00", endTime: "06:00" },
    expected: false
  },
  {
    name: "Overnight hours - incorrect day",
    time: new Date("2026-09-02T02:00:00"), // Wednesday 02:00
    config: { activeDays: ["Mon", "Tue"], startTime: "22:00", endTime: "06:00" },
    expected: false
  },
  {
    name: "Empty active days list",
    time: new Date("2026-08-31T12:00:00"),
    config: { activeDays: [], startTime: "09:00", endTime: "17:00" },
    expected: false
  }
];

let failed = 0;
console.log("🧪 Running scheduler time-window validation tests...\n");

tests.forEach((t) => {
  const result = isSchedulerInActiveWindow(t.time, t.config);
  if (result === t.expected) {
    console.log(`✅ PASS: ${t.name}`);
  } else {
    console.error(`❌ FAIL: ${t.name} (Expected: ${t.expected}, Got: ${result})`);
    failed++;
  }
});

console.log(`\n📊 Test Results: ${tests.length - failed}/${tests.length} passed.`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log("🎉 All tests passed successfully!");
}
