/* --- 1. INITIALIZATION & UI HANDLERS --- */

document.addEventListener(
  "wheel",
  function (e) {
    if (e.target.type === "number") {
      e.preventDefault();
      let step =
        e.target.id === "sinRes" || e.target.id === "physRes" ? 0.1 : 1;

      if (e.deltaY < 0) {
        e.target.value = (parseFloat(e.target.value) + step).toFixed(
          step === 1 ? 0 : 1,
        );
      } else {
        e.target.value = (parseFloat(e.target.value) - step).toFixed(
          step === 1 ? 0 : 1,
        );
      }
      e.target.dispatchEvent(new Event("input"));
    }
  },
  { passive: false },
);

// Dynamic Coin Rows Generation
const coinCountInput = document.getElementById("coinCount");
const coinRowsContainer = document.getElementById("coinRowsContainer");

function updateCoinRows() {
  let count = parseInt(coinCountInput.value) || 1;
  if (count > 100) {
    count = 100;
    coinCountInput.value = 100;
  }
  const currentRows = coinRowsContainer.querySelectorAll(".coin-row");
  const currentCount = currentRows.length;

  if (count > currentCount) {
    for (let i = currentCount; i < count; i++) {
      const row = document.createElement("div");
      row.className = "coin-row";
      row.id = `coin-row-${i}`;
      row.innerHTML = `
                <div class="coin-label">Coin ${i + 1}</div>
                <div>
                    <input type="number" class="c-power" placeholder="Bonus Coin Power" value="0">
                    <div class="note">Bonus Coin Power</div>
                </div>
                <div>
                    <input type="number" class="c-flat" placeholder="Bonus Flat Dmg" value="0">
                    <div class="note">Bonus Flat Dmg</div>
                </div>
                <div>
                    <input type="number" class="c-pct" placeholder="Bonus % Dmg" value="0">
                    <div class="note">Bonus % Dmg</div>
                </div>
            `;
      coinRowsContainer.appendChild(row);
    }
  } else if (count < currentCount) {
    for (let i = currentCount - 1; i >= count; i--) {
      coinRowsContainer.removeChild(currentRows[i]);
    }
  }
}

coinCountInput.addEventListener("input", updateCoinRows);
updateCoinRows(); // Init

// SP Slider Logic
const spInput = document.getElementById("spInput");
const spDisplay = document.getElementById("spValueDisplay");
const headsDisplay = document.getElementById("headsChanceDisplay");

function updateSp() {
  const val = parseInt(spInput.value);
  spDisplay.textContent = val;
  let chance = 50 + val;
  if (chance > 95) chance = 95;
  if (chance < 5) chance = 5;
  headsDisplay.textContent = chance + "%";
  return chance / 100;
}
spInput.addEventListener("input", updateSp);

function toggleDropdown(contentId) {
  const content = document.getElementById(contentId);
  const summary = content.previousElementSibling;
  const arrow = summary.querySelector("span:last-child");

  const isActive = content.classList.toggle("active");
  summary.classList.toggle("active");
  arrow.textContent = isActive ? "▲" : "▼";
}

/* --- 2. CALCULATION LOGIC --- */

/** Gathers all user-configurable values from the DOM. */
function getInputs() {
  const getSum = (id) => {
    let s = 0;
    document
      .querySelectorAll(`#${id} input[type="number"]`)
      .forEach((i) => (s += parseFloat(i.value) || 0));
    return s;
  };

  const coinSpecifics = [];
  document.querySelectorAll("#coinRowsContainer .coin-row").forEach((row) => {
    coinSpecifics.push({
      bonusPower: parseFloat(row.querySelector(".c-power").value) || 0,
      flatDmg: parseFloat(row.querySelector(".c-flat").value) || 0,
      pctDmg: (parseFloat(row.querySelector(".c-pct").value) || 0) / 100.0,
    });
  });

  return {
    baseP: getSum("basePowerList"),
    coinP: getSum("coinPowerList"),
    coins: parseInt(document.getElementById("coinCount").value) || 1,
    offLvl: getSum("offenseLevelList"),
    defLvl: parseFloat(document.getElementById("defenseLevel").value) || 0,
    sinRes: parseFloat(document.getElementById("sinRes").value) || 1.0,
    physRes: parseFloat(document.getElementById("physRes").value) || 1.0,
    stagger: parseFloat(document.getElementById("staggerState").value) || 1.0,
    atkMods: getSum("atkModList") / 100.0,
    defMods: getSum("defModList") / 100.0,
    coinSpecifics: coinSpecifics,
  };
}

/**
 * Calculates the static and dynamic multipliers based on the README formula.
 * @param {object} inputs - The collected inputs from getInputs().
 * @returns {object} An object containing the calculated multipliers.
 */
function calculateMultipliers(inputs) {
  // Level Modifier
  const levelDiff = inputs.offLvl - inputs.defLvl;
  const levelMod = levelDiff === 0 ? 0 : levelDiff / (Math.abs(levelDiff) + 25);

  // Static Multiplier Pool (per README)
  const staticMult = 1 + (inputs.sinRes - 1) + (inputs.physRes - 1) + levelMod;

  // Dynamic Multiplier Pool (base)
  const dynamicMult = 1 + inputs.atkMods + inputs.defMods;

  return {
    static: Math.max(0, staticMult),
    baseDynamic: dynamicMult,
    levelMod: levelMod,
  };
}

/**
 * Calculates the damage for a single hit based on the README formula.
 * Damage = floor(Power * StaticMultiplier * DynamicMultiplier * Stagger) + FlatDamage
 */
function calculateHit(power, staticMult, dynamicMult, stagger, flatDmg) {
  const finalDamage =
    Math.floor(power * staticMult * dynamicMult * stagger) + flatDmg;
  return Math.max(1, finalDamage);
}

let chartInstance = null;
let sandboxState = []; // Stores true (Head) / false (Tail) for sandbox

function calculateDamage() {
  const inputs = getInputs();
  const multipliers = calculateMultipliers(inputs);

  const headsChance = updateSp();
  const totalPerms = Math.pow(2, inputs.coins);
  let results = [];
  let minDmg = Infinity,
    maxDmg = -Infinity,
    avgDmg = 0;

  for (let i = 0; i < totalPerms; i++) {
    let totalDamage = 0;
    let currentProb = 1.0;
    let currentCoinBonus = 0;
    let seqStr = [];
    let accumulatedBonusPower = 0;

    for (let c = 0; c < inputs.coins; c++) {
      const isHead = (i >> c) & 1;
      currentProb *= isHead ? headsChance : 1.0 - headsChance;
      seqStr.push(isHead ? "H" : "T");

      if (isHead) currentCoinBonus += inputs.coinP;

      const spec = inputs.coinSpecifics[c];
      accumulatedBonusPower += spec.bonusPower;

      let hitPower = inputs.baseP + currentCoinBonus + accumulatedBonusPower;
      if (hitPower < 0) hitPower = 0;

      // Per-coin dynamic multiplier
      const dynamicMultiplier = Math.max(
        0,
        multipliers.baseDynamic + spec.pctDmg,
      );

      const hitDmg = calculateHit(
        hitPower,
        multipliers.static,
        dynamicMultiplier,
        inputs.stagger,
        spec.flatDmg,
      );

      totalDamage += hitDmg;
    }

    results.push({
      seq: seqStr.join(" "),
      dmg: totalDamage,
      prob: currentProb,
    });
    if (totalDamage < minDmg) minDmg = totalDamage;
    if (totalDamage > maxDmg) maxDmg = totalDamage;
    avgDmg += totalDamage * currentProb;
  }

  updateResultsUI({ minDmg, maxDmg, avgDmg, results });
  updateGraphUI(results, maxDmg);

  // Initialize Sandbox State if length changed
  if (sandboxState.length !== inputs.coins) {
    sandboxState = new Array(inputs.coins).fill(true); // Default all heads
  }
  updateSandboxUI(inputs, multipliers);
}

function updateResultsUI({ minDmg, maxDmg, avgDmg, results }) {
  document.getElementById("resMin").textContent = minDmg;
  document.getElementById("resMax").textContent = maxDmg;
  document.getElementById("resAvg").textContent = avgDmg.toFixed(1);
  document.getElementById("results").style.display = "block";

  const tbody = document.getElementById("probTableBody");
  tbody.innerHTML = "";
  results.sort((a, b) => b.prob - a.prob);

  results.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
        <td style="font-family:monospace; color:#aaa;">${r.seq}</td>
        <td style="color:#ffcece; font-weight:bold;">${r.dmg}</td>
        <td>${(r.prob * 100).toFixed(2)}%</td>
    `;
    tbody.appendChild(tr);
  });
}

function updateGraphUI(results, maxDmg) {
  let graphData = {};
  results.forEach((r) => {
    graphData[r.dmg] = (graphData[r.dmg] || 0) + r.prob;
  });
  let sortedGraph = Object.keys(graphData)
    .map((d) => ({ dmg: parseInt(d), prob: graphData[d] }))
    .sort((a, b) => a.dmg - b.dmg);

  const ctx = document.getElementById("damageChart").getContext("2d");
  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: sortedGraph.map((i) => i.dmg),
      datasets: [
        {
          label: "Probability",
          data: sortedGraph.map((i) => (i.prob * 100).toFixed(2)),
          backgroundColor: sortedGraph.map((i) =>
            i.dmg == maxDmg ? "#b73e3e" : "#666",
          ),
          barPercentage: 0.8,
          categoryPercentage: 0.8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.raw}% chance`,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: "Probability (%)" },
          ticks: { color: "#ccc" },
          grid: { color: "#444" },
        },
        x: {
          title: { display: true, text: "Total Damage" },
          ticks: { color: "#ccc" },
          grid: { color: "transparent" },
        },
      },
    },
  });
}

/* --- 3. SANDBOX LOGIC --- */

function updateSandboxUI(inputs, multipliers) {
  // Update Hidden Calcs
  const lvlPct = (multipliers.levelMod * 100).toFixed(1);
  const lvlMult = (1 + multipliers.levelMod).toFixed(3);
  document.getElementById("sb-lvlmod").textContent = `${lvlPct}% (x${lvlMult})`;

  const globalPct = ((multipliers.baseDynamic - 1) * 100).toFixed(1);
  const globalMult = multipliers.baseDynamic.toFixed(2);
  document.getElementById("sb-globalmod").textContent =
    `${globalPct}% (x${globalMult})`;

  // Resistance Multiplier: Combine Static Resistance parts (Sin/Phys) with Stagger
  // Static Res Part = 1 + (Sin - 1) + (Phys - 1)
  const staticResPart = 1 + (inputs.sinRes - 1) + (inputs.physRes - 1);
  const totalResMult = staticResPart * inputs.stagger;
  document.getElementById("sb-resmod").textContent =
    "x" + totalResMult.toFixed(2);

  const baseTotalMultiplier =
    multipliers.static * multipliers.baseDynamic * inputs.stagger;
  document.getElementById("sb-totalmult").textContent =
    "x" + baseTotalMultiplier.toFixed(2);

  // Build Rows
  const container = document.getElementById("sandbox-coins");
  container.innerHTML = "";
  let totalDamage = 0;
  let totalPower = 0;
  let currentCoinBonus = 0;
  let accumulatedBonusPower = 0;

  for (let c = 0; c < inputs.coins; c++) {
    const isHead = sandboxState[c];
    if (isHead) currentCoinBonus += inputs.coinP;

    const spec = inputs.coinSpecifics[c];
    accumulatedBonusPower += spec.bonusPower;

    let hitPower = inputs.baseP + currentCoinBonus + accumulatedBonusPower;
    if (hitPower < 0) hitPower = 0;
    totalPower += hitPower;

    const dynamicMultiplier = Math.max(
      0,
      multipliers.baseDynamic + spec.pctDmg,
    );

    const hitDmg = calculateHit(
      hitPower,
      multipliers.static,
      dynamicMultiplier,
      inputs.stagger,
      spec.flatDmg,
    );
    totalDamage += hitDmg;

    // DOM Construction
    const finalMultiplierForDisplay =
      multipliers.static * dynamicMultiplier * inputs.stagger;
    const div = document.createElement("div");
    div.className = "sandbox-coin-row";
    div.innerHTML = `
            <div style="color:#aaa; font-weight:bold;">C${c + 1}</div>
            <div class="toggle-btn ${isHead ? "heads" : "tails"}" onclick="toggleSandboxCoin(${c})">
                ${isHead ? "H" : "T"}
            </div>
            <div>
                <div class="sb-stat">Power: <span>${hitPower}</span></div>
                <div class="sb-stat">Dmg: <span>${hitDmg}</span></div>
            </div>
            <div style="font-size:0.8em; color:#666;">
                Base: ${inputs.baseP + currentCoinBonus + accumulatedBonusPower}<br>
                Mult: x${finalMultiplierForDisplay.toFixed(2)}
            </div>
        `;
    container.appendChild(div);
  }

  document.getElementById("sb-raw-power").textContent = totalPower;
  document.getElementById("sb-final-dmg").textContent = totalDamage;
}

function toggleSandboxCoin(index) {
  sandboxState[index] = !sandboxState[index];
  // Since CalculateDamage calls updateSandboxUI, we just call calculateDamage().
  calculateDamage();
}

/* --- 4. MODIFIER LOGIC --- */

window.addEventListener("load", () => {
  createDummyRow("atkModList", "atkModTotal");
  createDummyRow("defModList", "defModTotal");

  // Initialize Basics with default values
  addFixedRow("basePowerList", "basePowerTotal", "Base", 4);
  createDummyRow("basePowerList", "basePowerTotal");

  addFixedRow("coinPowerList", "coinPowerTotal", "Base", 4);
  createDummyRow("coinPowerList", "coinPowerTotal");

  addFixedRow("offenseLevelList", "offenseLevelTotal", "Base", 60);
  createDummyRow("offenseLevelList", "offenseLevelTotal");
});

function addFixedRow(containerId, totalId, name, val) {
  const container = document.getElementById(containerId);
  const div = document.createElement("div");
  div.className = "mod-item";
  div.innerHTML = `
        <input type="text" value="${name}" oninput="promoteRow(this, '${containerId}', '${totalId}')">
        <input type="number" value="${val}" oninput="promoteRow(this, '${containerId}', '${totalId}')">
        <button class="btn-mini btn-remove" onclick="removeModRow(this, '${containerId}', '${totalId}')">×</button>
    `;
  container.appendChild(div);
  updateTotal(containerId, totalId);
}

function createDummyRow(containerId, totalId) {
  const container = document.getElementById(containerId);
  const placeholder = totalId.includes("Mod") ? "%" : "Val";
  const div = document.createElement("div");
  div.className = "mod-item dummy-row";
  div.innerHTML = `
        <input type="text" placeholder="Name..." oninput="promoteRow(this, '${containerId}', '${totalId}')">
        <input type="number" placeholder="${placeholder}" oninput="promoteRow(this, '${containerId}', '${totalId}')">
        <button class="btn-mini btn-remove" style="visibility: hidden;" onclick="removeModRow(this, '${containerId}', '${totalId}')">×</button>
    `;
  container.appendChild(div);
}

function promoteRow(inputEl, containerId, totalId) {
  const row = inputEl.parentElement;
  if (row.classList.contains("dummy-row")) {
    row.classList.remove("dummy-row");
    row.querySelector(".btn-remove").style.visibility = "visible";
    row.querySelectorAll("input").forEach((inp) => {
      inp.addEventListener("input", () => updateTotal(containerId, totalId));
    });
    createDummyRow(containerId, totalId);
  }
  updateTotal(containerId, totalId);
}

function removeModRow(btn, containerId, totalId) {
  btn.parentElement.remove();
  updateTotal(containerId, totalId);
}

function updateTotal(containerId, totalId) {
  const container = document.getElementById(containerId);
  const inputs = container.querySelectorAll('input[type="number"]');
  let sum = 0;
  inputs.forEach((inp) => {
    const val = parseFloat(inp.value);
    if (!isNaN(val)) sum += val;
  });
  const suffix = totalId.includes("Mod") ? "%" : "";
  document.getElementById(totalId).textContent = `Total: ${sum}${suffix}`;
}
