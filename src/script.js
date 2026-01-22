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
  const count = parseInt(coinCountInput.value) || 1;
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

let chartInstance = null;
let sandboxState = []; // Stores true (Head) / false (Tail) for sandbox

function calculateDamage() {
  // Core Stats
  const baseP = parseFloat(document.getElementById("basePower").value) || 0;
  const coinP = parseFloat(document.getElementById("coinPower").value) || 0;
  const coins = parseInt(document.getElementById("coinCount").value) || 1;

  // Level Calc
  const offLvl = parseFloat(document.getElementById("offenseLevel").value) || 0;
  const defLvl = parseFloat(document.getElementById("defenseLevel").value) || 0;
  const levelDiff = offLvl - defLvl;
  const levelMod = levelDiff / (Math.abs(levelDiff) + 25);

  // Global Modifiers
  const sinRes = parseFloat(document.getElementById("sinRes").value) || 1.0;
  const physRes = parseFloat(document.getElementById("physRes").value) || 1.0;
  const stagger =
    parseFloat(document.getElementById("staggerState").value) || 1.0;

  const getSum = (id) => {
    let s = 0;
    document
      .querySelectorAll(`#${id} input[type="number"]`)
      .forEach((i) => (s += parseFloat(i.value) || 0));
    return s;
  };
  const totalPctMod = (getSum("atkModList") + getSum("defModList")) / 100.0;
  const globalDmgMult = 1.0 + levelMod + totalPctMod;

  const coinSpecifics = [];
  document.querySelectorAll("#coinRowsContainer .coin-row").forEach((row) => {
    coinSpecifics.push({
      bonusPower: parseFloat(row.querySelector(".c-power").value) || 0,
      flatDmg: parseFloat(row.querySelector(".c-flat").value) || 0,
      pctDmg: (parseFloat(row.querySelector(".c-pct").value) || 0) / 100.0,
    });
  });

  const headsChance = updateSp();
  const totalPerms = Math.pow(2, coins);
  let results = [];
  let minDmg = Infinity,
    maxDmg = -Infinity,
    avgDmg = 0;

  for (let i = 0; i < totalPerms; i++) {
    let currentProb = 1.0;
    let currentTotalDmg = 0;
    let currentTotalPower = 0;
    let currentCoinBonus = 0;
    let seqStr = [];
    let accumulatedBonusPower = 0;

    for (let c = 0; c < coins; c++) {
      const isHead = (i >> c) & 1;
      currentProb *= isHead ? headsChance : 1.0 - headsChance;
      seqStr.push(isHead ? "H" : "T");

      if (isHead) currentCoinBonus += coinP;

      const spec = coinSpecifics[c] || { bonusPower: 0, flatDmg: 0, pctDmg: 0 };

      // Accumulate bonus power
      accumulatedBonusPower += spec.bonusPower;

      let hitPower = baseP + currentCoinBonus + accumulatedBonusPower;
      if (hitPower < 0) hitPower = 0;

      currentTotalPower += hitPower;

      let finalMod = globalDmgMult + spec.pctDmg;
      // Double check negative modifiers don't invert damage, though rare in Limbus
      if (finalMod < 0) finalMod = 0;

      let hitDmg =
        hitPower * finalMod * sinRes * physRes * stagger + spec.flatDmg;
      hitDmg = Math.max(1, Math.floor(hitDmg));
      currentTotalDmg += hitDmg;
    }

    results.push({
      seq: seqStr.join(" "),
      dmg: currentTotalDmg,
      prob: currentProb,
    });
    if (currentTotalDmg < minDmg) minDmg = currentTotalDmg;
    if (currentTotalDmg > maxDmg) maxDmg = currentTotalDmg;
    avgDmg += currentTotalDmg * currentProb;
  }

  // Update Summary Boxes
  document.getElementById("resMin").textContent = minDmg;
  document.getElementById("resMax").textContent = maxDmg;
  document.getElementById("resAvg").textContent = avgDmg.toFixed(1);
  document.getElementById("results").style.display = "block";

  // Update Table
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

  // Graph
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
          data: sortedGraph.map((i) => (i.prob * 100).toFixed(2)),
          backgroundColor: sortedGraph.map((i) =>
            i.dmg == maxDmg ? "#b73e3e" : "#666",
          ),
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true }, x: { ticks: { color: "#ccc" } } },
    },
  });

  // Initialize Sandbox State if length changed
  if (sandboxState.length !== coins) {
    sandboxState = new Array(coins).fill(true); // Default all heads
  }
  updateSandboxUI(
    baseP,
    coinP,
    coins,
    levelMod,
    totalPctMod,
    coinSpecifics,
    sinRes,
    physRes,
    stagger,
  );
}

/* --- 3. SANDBOX LOGIC --- */

function updateSandboxUI(
  baseP,
  coinP,
  coins,
  levelMod,
  totalPctMod,
  coinSpecifics,
  sinRes,
  physRes,
  stagger,
) {
  // Update Hidden Calcs
  document.getElementById("sb-lvlmod").textContent =
    (levelMod * 100).toFixed(1) + "%";
  document.getElementById("sb-globalmod").textContent =
    (totalPctMod * 100).toFixed(1) + "%";

  const resMult = sinRes * physRes * stagger;
  document.getElementById("sb-resmod").textContent = "x" + resMult.toFixed(2);

  const totalMultBase = 1.0 + levelMod + totalPctMod;
  document.getElementById("sb-totalmult").textContent =
    "x" + (totalMultBase * resMult).toFixed(2);

  // Build Rows
  const container = document.getElementById("sandbox-coins");
  container.innerHTML = "";
  let currentTotalDmg = 0;
  let currentTotalPower = 0;
  let currentCoinBonus = 0;
  let accumulatedBonusPower = 0;

  for (let c = 0; c < coins; c++) {
    const isHead = sandboxState[c];
    if (isHead) currentCoinBonus += coinP;

    const spec = coinSpecifics[c] || { bonusPower: 0, flatDmg: 0, pctDmg: 0 };
    accumulatedBonusPower += spec.bonusPower;

    let hitPower = baseP + currentCoinBonus + accumulatedBonusPower;
    if (hitPower < 0) hitPower = 0;

    currentTotalPower += hitPower;

    let finalMod = totalMultBase + spec.pctDmg;
    if (finalMod < 0) finalMod = 0;

    let hitDmg = hitPower * finalMod * resMult + spec.flatDmg;
    hitDmg = Math.max(1, Math.floor(hitDmg));
    currentTotalDmg += hitDmg;

    // DOM Construction
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
                Base: ${baseP + currentCoinBonus + accumulatedBonusPower}<br>
                Mod: ${(finalMod * 100).toFixed(0)}%
            </div>
        `;
    container.appendChild(div);
  }

  document.getElementById("sb-raw-power").textContent = currentTotalPower;
  document.getElementById("sb-final-dmg").textContent = currentTotalDmg;
}

function toggleSandboxCoin(index) {
  sandboxState[index] = !sandboxState[index];
  // Re-run full calculation to get latest modifiers (inefficient but safe) or pass stored?
  // Better: trigger Main Calc, but we need to preserve state.
  // Since CalculateDamage calls updateSandboxUI, we just call calculateDamage().
  calculateDamage();
}

/* --- 4. MODIFIER LOGIC --- */

window.addEventListener("load", () => {
  createDummyRow("atkModList", "atkModTotal");
  createDummyRow("defModList", "defModTotal");
});

function createDummyRow(containerId, totalId) {
  const container = document.getElementById(containerId);
  const div = document.createElement("div");
  div.className = "mod-item dummy-row";
  div.innerHTML = `
        <input type="text" placeholder="Name..." oninput="promoteRow(this, '${containerId}', '${totalId}')">
        <input type="number" placeholder="%" oninput="promoteRow(this, '${containerId}', '${totalId}')">
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
  document.getElementById(totalId).textContent = `Total: ${sum}%`;
}
