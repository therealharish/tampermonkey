// ==UserScript==
// @name         Bazaar Auto Price Enhanced V3 with IM2 and TornPal
// @namespace    tos
// @version      0.9.1
// @description  Original "Bazaar Auto Price" plus TornPal API integration, margin settings, and multiple item selection
// @author       tos, Lugburz, Modified
// @match        *.torn.com/bazaar.php*
// @connect      api.torn.com
// @connect      weav3r.dev
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

const apikey = '5RLiL5W1FiijFSBr'

// List of items with fixed price (id: price).
// These prices will be used regardless of the current market offers.
const fixedPrices = {
    224: 1995,
    8: 2995,
    614: 799990, //diamond bladed knifes
    240: 16999990, //type 98 antitank
    333: 5500000, // liquid body armor
    398: 3749000, // sig 552
    251: 59990, //wushu double axes
    255: 2499000
};

// List of items with min price (id: price).
// Like fixed price, but if the current lowest bazaar price is greater than the min price, the bazaar price will be used.
const minPrices = {
    //180: 990, //Beer
};

// List of items to exclude from TornPal API pricing (use original torn API method)
const tornpalExcludeItems = [
    // Plushies
    '186', '187', '215', '258', '261', '266', '268', '269',
    '273', '274', '281', '384', '618',

    // Flowers
    '97', '129', '183', '184', '260', '263', '264', '267',
    '271', '272', '276', '277', '282', '385', '617'
];

const payExtra = [
    '186', '187', '215'
];

// Delay between getting prices (msec). Helps prevent exhausting of API requests limit.
// Set to 0 to disable the delay.
const delay = 1000;

// Adds extra %% to prices below $10,000. Default: 25.
const extraPercent = 0;

GM_addStyle(`
.input-margin {
  box-sizing: border-box;
  padding: 5px;
  width: 60px;
  border: 1px solid #ccc;
  border-radius: 5px;
  font-family: Arial,serif;
  line-height: 14px;
  text-align: left;}`);

const torn_api = async (args, itemID) => {
  if (!itemID) throw(`Item ID is required`);
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: "GET",
      url: `https://api.torn.com/v2/market/?selections=itemmarket&key=${apikey}&id=${itemID}&offset=0`,
      headers: {
        "Content-Type": "application/json"
      },
      onload: (response) => {
          try {
            const resjson = JSON.parse(response.responseText);
            resolve(resjson);
          } catch(err) {
            reject(err);
          }
      },
      onerror: (err) => {
        reject(err);
      }
    });
  });
};

const torn_api_for_market_value = async (args, itemID) => {
  if (!itemID) throw(`Item ID is required`);
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: "GET",
      url: `https://api.torn.com/torn/${itemID}?selections=items&key=${apikey}`,
      headers: {
        "Content-Type": "application/json"
      },
      onload: (response) => {
          try {
            const resjson = JSON.parse(response.responseText);
            resolve(resjson);
          } catch(err) {
            reject(err);
          }
      },
      onerror: (err) => {
        reject(err);
      }
    });
  });
};

// Fixed function to get prices from TornPal API
const tornpal_api = async (itemID) => {
  if (!itemID) throw(`Item ID is required`);
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: "GET",
      url: `https://weav3r.dev/api/marketplace/${itemID}`,
      headers: {
        "accept": "application/json"
      },
      onload: (response) => {
          try {
            if (response.status !== 200) {
              reject(new Error(`HTTP ${response.status}: ${response.statusText}`));
              return;
            }
            const resjson = JSON.parse(response.responseText);
            resolve(resjson);
          } catch(err) {
            reject(err);
          }
      },
      onerror: (err) => {
        reject(err);
      }
    });
  });
};

var event = new Event('keyup')
var APIERROR = false

async function lmp(itemID) {
  if (APIERROR === true) return 'API key error';

  // Check if item is in exclusion list
  const useOriginalMethod = tornpalExcludeItems.includes(itemID);

  try {
    // Get market value (for comparison)
    const mprice = await getItemValue(itemID);

    // Get item market price from Torn API for comparison
    const prices = await torn_api(`market`, itemID);
    if (prices.error) {
      APIERROR = true;
      return 'API key error';
    }

    // Retrieve the lowest listing price from the 'listings' array
    const listings = prices.itemmarket.listings;
    if (!listings || listings.length === 0) return 'No listings available';

    let lowest_market_price = listings[2].price; // Get the actual lowest price (first in array)
    console.log("Lowest market price: ", lowest_market_price);

    if (payExtra.includes(itemID) || (lowest_market_price < 1000)) {
        console.log("pay extra items found");
        lowest_market_price = lowest_market_price + 100;
    }

    // If item is in exclusion list, use original method
    if (useOriginalMethod) {
      return Math.max(lowest_market_price, mprice);
    } else {
      // Use TornPal API
      try {
        const tornpalData = await tornpal_api(itemID);
        console.log("TornPal data received:", tornpalData);

        // Check if we have the required data structure
        if (!tornpalData.listings || !Array.isArray(tornpalData.listings) || tornpalData.listings.length < 2) {
          console.log("Not enough TornPal listings, falling back to original method");
          return Math.max(lowest_market_price, mprice);
        }

        // Get second listing price from TornPal and subtract 5
        const secondPrice = tornpalData.listings[1].price - 5;
        console.log("TornPal second listing price minus 5:", secondPrice);

        // Use whichever is higher as reference price: market price or item market price
        const referencePrice = Math.max(mprice, lowest_market_price);
        console.log("Reference price:", referencePrice);

        // Check if the price is at least 97% of reference price
        const minAcceptablePrice = Math.round(referencePrice * 0.95);
        console.log("Min acceptable price (97% of reference):", minAcceptablePrice);

        if (secondPrice >= minAcceptablePrice) {
          console.log("Using TornPal price:", secondPrice);
          return secondPrice;
        } else {
          // If price is too low, use the minimum acceptable price
          console.log("TornPal price too low, using min acceptable price:", minAcceptablePrice);
          return minAcceptablePrice;
        }
      } catch (error) {
        console.error("Error fetching TornPal data:", error);
        // Fallback to original API on error
        return Math.max(lowest_market_price, mprice);
      }
    }
  } catch (error) {
    console.error("Error in lmp function:", error);
    return 'Error fetching price data';
  }
}

async function getItemValue(itemID) {
  if (APIERROR === true) return 'API key error';

  const itemInfo = await torn_api_for_market_value(`market.itemmarket.bazaar`, itemID);
  if (itemInfo.error) {APIERROR = true; return 'API key error';}
  return itemInfo['items'][itemID].market_value;
}

// HACK to simulate input value change
// https://github.com/facebook/react/issues/11488#issuecomment-347775628
function reactInputHack(inputjq, value) {
    // get js object from jquery
    const input = $(inputjq).get(0);

    let lastValue = 0;
    input.value = value;
    let event = new Event('input', { bubbles: true });
    // hack React15
    event.simulated = true;
    // hack React16 内部定义了descriptor拦截value，此处重置状态
    let tracker = input._valueTracker;
    if (tracker) {
        tracker.setValue(lastValue);
    }
    input.dispatchEvent(event);
}

function setPrice(elem, itemID, itemPrice = -1) {
    let margin = $('#margin-box').val();
    if (typeof fixedPrices[itemID] !== 'undefined' && !isNaN(fixedPrices[itemID])) {
        //$(elem).val(fixedPrices[itemID]);
        reactInputHack(elem, fixedPrices[itemID]);
        $(elem).trigger(event);
        $(elem).off('focus');
    } else if (itemPrice != -1) {
        //$(elem).val(Math.round(itemPrice * margin / 100));
        if (itemPrice < 10000) margin = 1*margin + 1*extraPercent;
        const p = (!isNaN(minPrices[itemID]) && minPrices[itemID] > itemPrice) ? minPrices[itemID] : Math.round(itemPrice * margin / 100);
        reactInputHack(elem, p);
        $(elem).trigger(event);
        $(elem).off('focus');
    } else {
        lmp(itemID).then((price) => {
            //$(elem).val(Math.round(price * margin / 100));
            if (price < 10000) margin = 1*margin + 1*extraPercent;
            const p = (!isNaN(minPrices[itemID]) && minPrices[itemID] > price) ? minPrices[itemID] : Math.round(price * margin / 100);
            reactInputHack(elem, p);
            $(elem).trigger(event);
            if (price) $(elem).off('focus');
        });
        GM_setValue('margin', $('#margin-box').val());
    }
}

function addOneFocusHandler(elem, itemID) {
    $(elem).on('click', function(e) {
        this.value = '';
        if (this.value === '') {
            setPrice(elem, itemID);
        }
    });
}

var ITEM_IDS = {};

function addItemsSetPrices(id) {
    const wrap = $('#bazaarRoot').find('div.items-wrap');
    const list = $(wrap).find('ul.items-cont:visible');

    if (id == -1) {
        // all items: add delay
        const size = $(list).children('li.clearfix').size();
        let i = 0;
        let x = setInterval(function() {
            const elem = $(list).children('li.clearfix')[i];
            const input = $(elem).find('.input-money[type=text]');
            const name = $(elem).find('div.image-wrap').find('img').attr('alt');
            setPrice(input, ITEM_IDS[name]);
            if (i == size-1) {
                clearInterval(x);
            }
            i++;
        }, delay);
    } else {
        // only get price once to save API requests
        lmp(id).then((price) => {
            $(list).children('li.clearfix').each(function() {
                const input = $(this).find('.input-money[type=text]');
                const name = $(this).find('div.image-wrap').find('img').attr('alt');
                if (name && ITEM_IDS[name] == id) {
                    setPrice(input, id, price);
                }
            });
        });
    }
}

function addItemsAutoSelect(id) {
    const wrap = $('#bazaarRoot').find('div.items-wrap');
    const list = $(wrap).find('ul.items-cont:visible');
    $(list).children('li.clearfix').each(function() {
        const input = $(this).find('.input-money[type=text]');
        const name = $(this).find('div.image-wrap').find('img').attr('alt');
        if (name && ITEM_IDS[name] == id) {
            const cb = $(this).find('a');
            $(cb).click();
        }
    });
}

function manageItemsSetPrices(id) {
    const panel = $('#bazaarRoot').find('div[class^=panel]');
    const input = $(panel).find('[class^=input-money]');

    if (id === -1) {
        // all items: add delay
        const size = $(input).size();
        let i = 0;
        let x = setInterval(function() {
            const elem = $(input)[i];
            const img = $(elem).parent().parent().find('img');
            const src = $(img).attr('src');
            if (src) {
                const itemID = src.split('items/')[1].split('/medium')[0];
                const inp = $(elem).find('.input-money');
                setPrice(inp, itemID);
            }

            if (i === size-1) clearInterval(x);
            i++;
        }, delay);
    } else {
        // only get price once to save API requests
        lmp(id).then((price) => {
            $(input).each(function() {
                const img = $(this).parent().parent().find('img');
                const src = $(img).attr('src');
                if (src) {
                    const itemID = src.split('items/')[1].split('/medium')[0];
                    const inp = $(this).find('.input-money');
                    if (itemID == id) setPrice(inp, itemID, price);
                }
            });
        });
    }
}

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
        if (typeof node.classList !== 'undefined' && node.classList) {
            const remove = $(node).find('[class*=removeAmountInput]');
            let input = $(node).find('[class^=input-money]');
            if ($(input).size() > 0 && $(remove).size() > 0) {
                // Manage items
                addManageUi();

                $(input).each(function() {
                    const img = $(this).parent().parent().find('img');
                    const src = $(img).attr('src');
                    if (src) {
                        const itemID = src.split('items/')[1].split('/medium')[0];
                        const inp = $(this).find('.input-money');
                        addOneFocusHandler($(inp), itemID);
                        $(inp).on('dblclick', function() {
                            manageItemsSetPrices(itemID);
                        });
                    }
                });
            } else if ($(input).size() > 0) {
                // Add items
                addAddUi();

                input = node.querySelector('.input-money[type=text]');
                const img = node.querySelector('img');
                if (input && img) {
                    const itemName = img.alt;
                    const itemID = img.src.split('items/')[1].split('/medium')[0].split('/large.png')[0];
                    ITEM_IDS[itemName] = itemID;
                    addOneFocusHandler($(input), itemID);
                    $(input).on('dblclick', function() {
                        addItemsSetPrices(itemID);
                    });

                    const cb = node.querySelector('a');
                    $(cb).on('dblclick', function() {
                        addItemsAutoSelect(itemID);
                    });
                }
            }
        }
    }
  }
});

function addManageUi() {
    if ($('#set-all-btn').size() < 1) {
        const panel = $('#bazaarRoot').find('div[class^=panelHeader_]');
        const btnDiv = '<div class="confirmation___BUSLB" role="heading">'+
              '<input id="margin-box" class="input-margin" type="number" min="1" max="200" step="1" aria-label="Set price to" value="100">' +
              '<span>% </span><button id="set-all-btn" class="torn-btn silver">Set all</button></div>';
        $(btnDiv).insertAfter(panel);

        if (GM_getValue('margin')) {
            $('#margin-box').val(GM_getValue('margin'));
        }

        // -1 for all items
        $('#set-all-btn').on('click', function(event) {
            event.preventDefault();
            manageItemsSetPrices(-1);
        });
    }
}

function addAddUi() {
    if ($('#set-all-btn').size() < 1) {
        const wrap = $('#bazaarRoot').find('div.items-wrap');
        const btnDiv = '<div class="items-footer clearfix">' +
              '<input id="margin-box" class="input-margin" type="number" min="1" max="200" step="1" aria-label="Set price to" value="100">' +
              '<span>% </span><button id="set-all-btn" class="torn-btn silver">Set all</button></div>';
        $(btnDiv).insertAfter('div.title-black');

        if (GM_getValue('margin')) {
            $('#margin-box').val(GM_getValue('margin'));
        }

        // -1 for all items
        $('#set-all-btn').on('click', function(event) {
            event.preventDefault();
            addItemsSetPrices(-1);
        });
    }
}

const wrapper = document.querySelector('#bazaarRoot')
observer.observe(wrapper, { subtree: true, childList: true })