// ==UserScript==
// @name          Inventory Sorter according to QTY
// @namespace     https://greasyfork.org/en/users/1362698-iambatman
// @description   Allows you to sort your inventory by price or quantity in ascending/descending order
// @version       2.0.1
// @author        Unique
// @grant         GM_xmlhttpRequest
// @grant         GM_getValue
// @grant         GM_setValue
// @connect       docs.google.com
// @connect       googleusercontent.com
// @connect       script.google.com
// @match         https://www.torn.com/item.php
// @updateURL     https://raw.githubusercontent.com/therealharish/tampermonkey/main/Inventory%20Sorter.js
// @downloadURL   https://raw.githubusercontent.com/therealharish/tampermonkey/main/Inventory%20Sorter.js
// ==/UserScript==
(function () {
  "use strict";
  const titleBarEl = document.querySelector(".title-black");
  const categoriesList = document.querySelector("#categoriesList");
  let sortState = "default";
  let sortType = "price";
  let parentElement;
  let itemsOriginal;
  let posOriginal;
  let loadedAll = false;
  let priceSortBtn, quantitySortBtn;

  // --- CSV Price Map ---
  const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQxfChP4booUCi7dTSVyJoJDPDvYt5AXIzsieqPN0LjSnakjiw_F0sET3K0Atdqc4tSBpJCZH-6nkwb/pub?output=csv";
  const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
  let priceMap = JSON.parse(GM_getValue("invSorterPriceMap", "{}"));
  let priceMapFetchedAt = parseInt(GM_getValue("invSorterPriceFetchedAt", "0")) || 0;
  let csvReady = Object.keys(priceMap).length > 0;

  function csvSplitRow(line) {
    const cols = []; let cur = "", inQ = false;
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (inQ) {
        if (ch === '"' && line[c + 1] === '"') { cur += '"'; c++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else {
        if (ch === '"') inQ = true;
        else if (ch === ",") { cols.push(cur); cur = ""; }
        else cur += ch;
      }
    }
    cols.push(cur);
    return cols;
  }

  function parseBuyCsv(text) {
    const map = {};
    const lines = text.split(/\r?\n/);
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || !line.trim()) continue;
      const cols = csvSplitRow(line);
      if (cols.length < 5) continue;
      const id = parseInt((cols[1] || "").trim(), 10);
      if (!id) continue;
      const normRaw = (cols[2] || "").replace(/[$,]/g, "").trim();
      const bulkRaw = (cols[4] || "").replace(/[$,]/g, "").trim();
      const norm = (normRaw && normRaw !== "#N/A") ? parseFloat(normRaw) : 0;
      const bulk = (bulkRaw && bulkRaw !== "#N/A") ? parseFloat(bulkRaw) : 0;
      const floor = bulk > 0 ? bulk : norm;
      if (floor > 0) map[id] = floor;
    }
    return map;
  }

  function fetchPricesCsv(force) {
    const age = Date.now() - priceMapFetchedAt;
    if (!force && age < CACHE_TTL_MS && csvReady) return;
    GM_xmlhttpRequest({
      method: "GET",
      url: CSV_URL,
      onload: (res) => {
        try {
          const map = parseBuyCsv(res.responseText);
          priceMap = map;
          priceMapFetchedAt = Date.now();
          csvReady = true;
          GM_setValue("invSorterPriceMap", JSON.stringify(map));
          GM_setValue("invSorterPriceFetchedAt", String(priceMapFetchedAt));
          injectInlinePrices();
        } catch (e) {
          console.error("[Inventory Sorter] CSV parse error:", e);
        }
      },
      onerror: () => {
        console.warn("[Inventory Sorter] Failed to fetch CSV prices.");
      }
    });
  }

  function getItemIdFromEl(itemEl) {
    const img = itemEl.querySelector('img[src*="/items/"]');
    if (!img) return null;
    const match = img.src.match(/\/items\/(\d+)\//)
               || img.src.match(/\/items\/(\d+)/);
    return match ? match[1] : null;
  }

  function injectInlinePrices() {
    if (!csvReady) return;
    document.querySelectorAll('[class*="items"] > li, [aria-hidden="false"] > li').forEach((itemEl) => {
      if (itemEl.querySelector(".csv-item-price")) return;
      const itemId = getItemIdFromEl(itemEl);
      if (!itemId) return;
      const unitPrice = priceMap[itemId] || 0;
      if (unitPrice <= 0) return;

      const quantityEl = itemEl.querySelector(".qty");
      const qty = quantityEl ? +quantityEl.textContent.replace(/[^0-9]/g, "") || 1 : 1;
      const total = Math.round(unitPrice * qty);

      const priceSpan = document.createElement("span");
      priceSpan.className = "csv-item-price";
      if (qty > 1) {
        priceSpan.textContent = `$${unitPrice.toLocaleString()} | ${qty}x = $${total.toLocaleString()}`;
      } else {
        priceSpan.textContent = `$${total.toLocaleString()}`;
      }

      itemEl.style.position = "relative";
      itemEl.appendChild(priceSpan);
    });
  }

  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .inv-sort-container {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        background: linear-gradient(to bottom, #3c3c3c, #2a2a2a);
        border-bottom: 1px solid #191919;
      }
      .inv-sort-label {
        color: #999;
        font-size: 12px;
        font-family: Arial, Helvetica, sans-serif;
        margin-right: 2px;
      }
      .inv-sort-btn {
        padding: 5px 14px;
        background: #333;
        color: #ccc;
        border: 1px solid #555;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        font-family: Arial, Helvetica, sans-serif;
        transition: all 0.15s ease;
        user-select: none;
        line-height: 1.4;
      }
      .inv-sort-btn:hover {
        background: #444;
        color: #fff;
        border-color: #777;
      }
      .inv-sort-btn.active {
        background: #4a7a2e;
        color: #fff;
        border-color: #5a9a3e;
      }
      .csv-item-price {
        position: absolute;
        right: 146px;
        top: 50%;
        transform: translateY(-50%);
        color: #65c32d;
        font-size: 10px;
        font-weight: bold;
        font-family: Arial, Helvetica, sans-serif;
        white-space: nowrap;
        z-index: 5;
        text-align: right;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  function updateButtonLabels() {
    const arrow =
      sortState === "descending" ? " \u25BC" : sortState === "ascending" ? " \u25B2" : "";

    if (sortType === "price" && sortState !== "default") {
      priceSortBtn.textContent = "Price" + arrow;
      priceSortBtn.classList.add("active");
      quantitySortBtn.textContent = "Quantity";
      quantitySortBtn.classList.remove("active");
    } else if (sortType === "quantity" && sortState !== "default") {
      quantitySortBtn.textContent = "Quantity" + arrow;
      quantitySortBtn.classList.add("active");
      priceSortBtn.textContent = "Price";
      priceSortBtn.classList.remove("active");
    } else {
      priceSortBtn.textContent = "Price";
      priceSortBtn.classList.remove("active");
      quantitySortBtn.textContent = "Quantity";
      quantitySortBtn.classList.remove("active");
    }
  }

  // Create sorting buttons
  function createSortButtons() {
    injectStyles();

    const buttonContainer = document.createElement("div");
    buttonContainer.className = "inv-sort-container";

    const label = document.createElement("span");
    label.className = "inv-sort-label";
    label.textContent = "Sort by:";

    // Price Sort Button
    priceSortBtn = document.createElement("button");
    priceSortBtn.textContent = "Price";
    priceSortBtn.className = "inv-sort-btn";
    priceSortBtn.addEventListener("click", () => {
      if (sortType !== "price") {
        sortType = "price";
        sortState = "default";
        itemsOriginal = null;
      }
      triggerSort();
    });

    // Quantity Sort Button
    quantitySortBtn = document.createElement("button");
    quantitySortBtn.textContent = "Quantity";
    quantitySortBtn.className = "inv-sort-btn";
    quantitySortBtn.addEventListener("click", () => {
      if (sortType !== "quantity") {
        sortType = "quantity";
        sortState = "default";
        itemsOriginal = null;
      }
      triggerSort();
    });

    buttonContainer.appendChild(label);
    buttonContainer.appendChild(priceSortBtn);
    buttonContainer.appendChild(quantitySortBtn);
    titleBarEl.insertAdjacentElement("afterend", buttonContainer);
  }

  async function triggerSort() {
    parentElement = document.querySelectorAll('[aria-hidden="false"]');
    if (!parentElement.length) return;
    if (!csvReady) {
      alert(
        "Inventory Sorter is still loading prices. Please wait a moment and try again."
      );
      return;
    }
    if (!posOriginal && !loadedAll) {
      posOriginal = window.scrollY;
      await loadAllItems();
    }
    if (sortState === "default") {
      itemsOriginal = Array.from(parentElement[0].children).map((itemEl) => {
          const itemId = getItemIdFromEl(itemEl);
          const unitPrice = (itemId && priceMap[itemId]) || 0;

          const quantityEl = itemEl.querySelector(".qty");
          const quantity = quantityEl
            ? +quantityEl.textContent.replace(/[^0-9]/g, "") || 0
            : 0;

          const price = Math.round(unitPrice * (quantity || 1));

          return { element: itemEl, price, quantity };
        });
    }
    sortItems(sortValues([...itemsOriginal]), parentElement);
    updateButtonLabels();
  }

  titleBarEl.addEventListener("click", async (e) => {
    if (e.target.closest("#items_search")) return;
    if (e.target.closest(".inv-sort-container")) return;
    triggerSort();
  });

  categoriesList.addEventListener("click", () => {
    handleTabChange();
  });

  const sortValues = function (items) {
    if (sortState === "default") {
      sortState = "descending";
      return items.sort((a, b) =>
        sortType === "price" ? b.price - a.price : b.quantity - a.quantity
      );
    } else if (sortState === "descending") {
      sortState = "ascending";
      return items.sort((a, b) =>
        sortType === "price" ? a.price - b.price : a.quantity - b.quantity
      );
    } else if (sortState === "ascending") {
      sortState = "default";
      return [...itemsOriginal];
    }
  };

  const handleTabChange = function () {
    if (itemsOriginal && parentElement) {
      sortItems(itemsOriginal, parentElement);
    }
    sortState = "default";
    itemsOriginal = null;
    posOriginal = null;
    loadedAll = false;
    updateButtonLabels();
  };

  const sortItems = function (_items, _parentElement) {
    _items.forEach((item) => _parentElement[0].appendChild(item.element));
  };

  const loadAllItems = async function () {
    const loadMoreEl = document.querySelector("#load-more-items-desc");
    if (!loadMoreEl) return;
    const text = loadMoreEl.textContent;
    if (text.toLowerCase().includes("full")) {
      window.scroll(0, posOriginal);
      loadedAll = true;
      return;
    }
    if (text.toLowerCase().includes("load more")) {
      document.querySelector(".items-wrap").lastElementChild.scrollIntoView();
      await new Promise((resolve) => setTimeout(resolve, 500));
      return loadAllItems();
    }
  };

  // Initialize script
  function init() {
    // Wait for the page to load
    const checkExist = setInterval(() => {
      const titleBar = document.querySelector(".title-black");
      if (titleBar) {
        clearInterval(checkExist);
        createSortButtons();
      }
    }, 100);
  }

  // Run initialization
  fetchPricesCsv(false);
  init();

  // Re-inject prices when DOM changes (new items loaded)
  const priceObs = new MutationObserver(() => {
    if (csvReady) injectInlinePrices();
  });
  priceObs.observe(document.body, { childList: true, subtree: true });
})();