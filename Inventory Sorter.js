// ==UserScript==
// @name          Inventory Sorter according to QTY
// @namespace     https://greasyfork.org/en/users/1362698-iambatman
// @description   Allows you to sort your inventory by price or quantity in ascending/descending order
// @version       1.1.0
// @author        Unique
// @grant         none
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
    if (!document.querySelector(".tt-item-price")) {
      alert(
        "Inventory Sorter requires Torn Tools to work properly. Make sure you install it before using this script!"
      );
      return;
    }
    if (!posOriginal && !loadedAll) {
      posOriginal = window.scrollY;
      await loadAllItems();
    }
    if (sortState === "default") {
      itemsOriginal = Array.from(parentElement[0].children).map((itemEl) => {
          const priceEl = itemEl.querySelector(".tt-item-price");
          const priceText = priceEl?.lastChild?.textContent || "0";
          const price = +priceText.replace(/[^0-9.-]+/g, "") || 0;

          const quantityEl = itemEl.querySelector(".qty");
          const quantity = quantityEl
            ? +quantityEl.textContent.replace(/[^0-9]/g, "") || 0
            : 0;

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
  init();
})();