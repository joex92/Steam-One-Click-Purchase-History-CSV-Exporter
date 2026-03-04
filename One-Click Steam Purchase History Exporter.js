// ==UserScript==
// @name         Steam Purchase History Exporter
// @namespace    https://github.com/joex92/Steam-One-Click-Purchase-History-CSV-Exporter
// @version      1.5
// @description  Export Steam account purchase history to a CSV file.
// @author       JoeX92 & Gemini AI Pro
// @match        https://store.steampowered.com/account/history*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Formats a Date object to YYYY/MM/DD for the CSV rows
    function formatToYYYYMMDD(date) {
        let yyyy = date.getFullYear();
        let mm = String(date.getMonth() + 1).padStart(2, '0');
        let dd = String(date.getDate()).padStart(2, '0');
        return `${yyyy}/${mm}/${dd}`;
    }

    // Formats a Date object to YYYY-MM-DD HH.MM.SS for the file name
    function formatForFileName(date) {
        let yyyy = date.getFullYear();
        let mm = String(date.getMonth() + 1).padStart(2, '0');
        let dd = String(date.getDate()).padStart(2, '0');
        let hh = String(date.getHours()).padStart(2, '0');
        let min = String(date.getMinutes()).padStart(2, '0');
        let ss = String(date.getSeconds()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd} ${hh}.${min}.${ss}`;
    }

    // Parses Steam's date string and formats it to YYYY/MM/DD
    function parseAndFormatSteamDate(steamDateStr) {
        if (!steamDateStr) return "";
        let d = new Date(steamDateStr);
        
        // Steam sometimes omits the year for the current year, making the date invalid.
        // We catch this and append the current year to fix the parsing.
        if (isNaN(d.getTime())) {
            d = new Date(steamDateStr + ", " + new Date().getFullYear());
            if (isNaN(d.getTime())) return steamDateStr; 
        }
        return formatToYYYYMMDD(d);
    }

    // Extracts the numeric portion of a price string, keeping positive (+) or negative (-) signs
    function extractNumber(str) {
        if (!str) return '';
        // Match an optional + or -, followed by any combination of digits, decimals, or commas
        let match = str.match(/[+-]?[\d.,]+/);
        return match ? match[0] : '';
    }

    // Extracts the currency code (e.g., USD, EUR) or a standard currency symbol
    function extractCurrency(str) {
        if (!str) return '';
        // Look for 3-letter currency codes
        let match = str.match(/[A-Z]{3}/i);
        if (match) return match[0].toUpperCase();
        
        // Fallback to searching for common currency symbols
        let symMatch = str.match(/[$€£¥]/);
        return symMatch ? symMatch[0] : '';
    }

    // Wait for the page to finish loading before injecting the floating UI
    window.addEventListener('load', () => {
        // Create the container for our control buttons
        let container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.bottom = '20px';
        container.style.right = '20px';
        container.style.display = 'flex';
        container.style.gap = '10px';
        container.style.zIndex = '9999';

        // Set up the main Export button
        let startBtn = document.createElement('button');
        startBtn.innerText = 'Export to CSV';
        styleButton(startBtn, '#66c0f4', '#171a21');

        // Set up the Pause button (hidden initially)
        let pauseBtn = document.createElement('button');
        pauseBtn.innerText = 'Pause';
        pauseBtn.style.display = 'none';
        styleButton(pauseBtn, '#e6c841', '#171a21');

        // Set up the Stop & Export button (hidden initially)
        let stopBtn = document.createElement('button');
        stopBtn.innerText = 'Stop & Export';
        stopBtn.style.display = 'none';
        styleButton(stopBtn, '#e64141', '#ffffff');

        // Append buttons to the container, and the container to the document body
        container.appendChild(startBtn);
        container.appendChild(pauseBtn);
        container.appendChild(stopBtn);
        document.body.appendChild(container);

        // State trackers for the lazy-loading process
        let isPaused = false;
        let isStopped = false;

        // Handle the Start click: hides the start button and shows the controls
        startBtn.addEventListener('click', () => {
            startBtn.style.display = 'none';
            pauseBtn.style.display = 'block';
            stopBtn.style.display = 'block';
            isPaused = false;
            isStopped = false;
            
            // Initiate the auto-scrolling function to load all purchases
            loadAllRecords(
                () => isPaused,
                () => isStopped,
                () => {
                    // Once scrolling is finished (or stopped), export the data
                    exportDataToCSV();
                    
                    // Reset the UI to its initial state
                    startBtn.style.display = 'block';
                    pauseBtn.style.display = 'none';
                    stopBtn.style.display = 'none';
                    pauseBtn.innerText = 'Pause';
                }
            );
        });

        // Toggle the paused state when the Pause button is clicked
        pauseBtn.addEventListener('click', () => {
            isPaused = !isPaused;
            pauseBtn.innerText = isPaused ? 'Resume' : 'Pause';
        });

        // Trigger the stop state to break out of the loading loop and export immediately
        stopBtn.addEventListener('click', () => {
            isStopped = true;
            stopBtn.innerText = 'Exporting...';
            stopBtn.disabled = true;
        });
    });

    // Applies a consistent style to the injected UI buttons
    function styleButton(btn, bgColor, color) {
        btn.style.padding = '12px 24px';
        btn.style.backgroundColor = bgColor;
        btn.style.color = color;
        btn.style.border = 'none';
        btn.style.borderRadius = '5px';
        btn.style.fontSize = '14px';
        btn.style.fontWeight = 'bold';
        btn.style.cursor = 'pointer';
        btn.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';
        
        // Add a simple hover effect
        btn.addEventListener('mouseover', () => { if (!btn.disabled) btn.style.filter = 'brightness(1.1)'; });
        btn.addEventListener('mouseout', () => { if (!btn.disabled) btn.style.filter = 'brightness(1)'; });
    }

    // Automatically scrolls down to trigger Steam's lazy loading, governed by user controls
    function loadAllRecords(getIsPaused, getIsStopped, onComplete) {
        let prevHeight = 0;
        let unchangedCount = 0;
        
        let interval = setInterval(() => {
            // Check if the user opted to stop the process
            if (getIsStopped()) {
                clearInterval(interval);
                onComplete();
                return;
            }

            // Skip execution on this tick if the user paused the script
            if (getIsPaused()) {
                return; 
            }

            // Scroll to the bottom of the page
            window.scrollTo(0, document.body.scrollHeight);
            
            // Occasionally, Steam displays a physical "Load More" button; click it if it exists
            let loadMoreBtn = document.getElementById('load_more_button');
            if (loadMoreBtn && window.getComputedStyle(loadMoreBtn).display !== 'none') {
                loadMoreBtn.click();
            }
            
            // Grab the current document height and check for Steam's loading spinner
            let currentHeight = document.body.scrollHeight;
            let loadingEl = document.getElementById('wallet_history_loading');
            let isLoading = loadingEl && window.getComputedStyle(loadingEl).display !== 'none';

            // Check if the page has stopped growing and nothing is actively loading
            if (currentHeight === prevHeight && !isLoading) {
                unchangedCount++;
                // Wait for ~6 consecutive seconds of inactivity to confirm we've hit the true bottom
                if (unchangedCount >= 6) { 
                    clearInterval(interval);
                    window.scrollTo(0, 0); 
                    onComplete();
                }
            } else {
                unchangedCount = 0;
                prevHeight = currentHeight;
            }
        }, 1000);
    }

    // Ensures CSV values don't break the formatting (e.g., handling internal commas/quotes)
    function escapeCSV(value) {
        if (value == null) return '""';
        let str = value.toString().trim().replace(/"/g, '""');
        return `"${str}"`;
    }

    // Core logic for scraping the loaded table, organizing the data, and triggering the download
    function exportDataToCSV() {
        let rows = document.querySelectorAll('.wallet_history_table tbody tr.wallet_table_row');
        let data = [];
        let paymentColumns = new Set(); // Tracks unique payment methods across all transactions

        // Iterate over every loaded row in the table
        rows.forEach(row => {
            // Scrape and format the Date
            let rawDate = row.querySelector('.wht_date') ? row.querySelector('.wht_date').innerText.trim() : '';
            let dateCol = parseAndFormatSteamDate(rawDate);
            
            // Scrape the Items, replacing new lines with a pipe " | " for clean single-line reading
            let itemsCol = '';
            let itemsTd = row.querySelector('.wht_items');
            if (itemsTd) {
                itemsCol = itemsTd.innerText.trim().replace(/\s*\n\s*/g, ' | ');
            }
            
            // Scrape pricing data, identifying undiscounted bases vs discounted percentages
            let rawPrice = '';
            let discountCol = '';
            let basePriceTd = row.querySelector('.wht_base_price');
            
            if (basePriceTd) {
                let discountedDiv = basePriceTd.querySelector('.wht_base_price_discounted');
                if (discountedDiv) {
                    let dPct = discountedDiv.querySelector('.wht_discount_pct');
                    let pOrig = discountedDiv.querySelector('.wht_original_price');
                    discountCol = dPct ? dPct.innerText.trim() : '';
                    rawPrice = pOrig ? pOrig.innerText.trim() : '';
                } else {
                    rawPrice = basePriceTd.innerText.trim();
                }
            }
            
            // Scrape tax, total, and wallet fields
            let rawTax = row.querySelector('.wht_tax') ? row.querySelector('.wht_tax').innerText.trim() : '';
            let rawTotal = row.querySelector('.wht_total') ? row.querySelector('.wht_total').innerText.trim() : '';
            let rawWalletChange = row.querySelector('.wht_wallet_change') ? row.querySelector('.wht_wallet_change').innerText.trim() : '';
            let rawWalletBalance = row.querySelector('.wht_wallet_balance') ? row.querySelector('.wht_wallet_balance').innerText.trim() : '';

            // Identify the currency used for this transaction
            let currencyCol = extractCurrency(rawTotal) || extractCurrency(rawPrice) || extractCurrency(rawWalletChange);

            // Strip the currency text from the amounts to leave clean numbers for spreadsheet math
            let priceCol = extractNumber(rawPrice);
            let taxCol = extractNumber(rawTax);
            let totalCol = extractNumber(rawTotal);
            let walletChangeCol = extractNumber(rawWalletChange);
            let walletBalanceCol = extractNumber(rawWalletBalance);

            // Dynamically scrape all payment methods used (Steam can split payments across Wallet + Card)
            let methods = {};
            let paymentDiv = row.querySelector('.wht_type .wth_payment');
            
            if (paymentDiv) {
                let subDivs = paymentDiv.querySelectorAll('div');
                if (subDivs.length > 0) {
                    subDivs.forEach(div => {
                        let text = div.textContent.trim();
                        // Steam uses large gaps (2+ spaces/tabs) to separate the amount from the method name
                        let parts = text.split(/\s{2,}/);
                        
                        if (parts.length >= 2) {
                            let method = parts.slice(1).join(' ').trim(); 
                            methods[method] = extractNumber(parts[0].trim());
                            paymentColumns.add(method);
                        } else if (text) {
                            // Fallback regex to split amount and method name if spacing is tight
                            let match = text.match(/^([^\d]*?\s*\d+[.,\d]*\s*[A-Za-z]*)\s+(.*)$/);
                            if (match) {
                                let method = match[2].trim();
                                methods[method] = extractNumber(match[1].trim());
                                paymentColumns.add(method);
                            } else {
                                // Worst-case fallback: map the entire text to the total amount
                                methods[text] = totalCol;
                                paymentColumns.add(text);
                            }
                        }
                    });
                } else {
                    // Scenario where only one payment method was used and has no inner divs
                    let method = paymentDiv.textContent.trim();
                    if (method) {
                        methods[method] = totalCol;
                        paymentColumns.add(method);
                    }
                }
            }

            // Check if the purchase was funded exclusively by the Steam Wallet
            let methodKeys = Object.keys(methods);
            let isWalletOnly = methodKeys.length === 1 && methodKeys[0].toLowerCase().includes('wallet');

            // Route Price and Total depending on whether it was a pure Wallet transaction
            let regularPriceCol = isWalletOnly ? '' : priceCol;
            let walletPriceCol = isWalletOnly ? priceCol : '';

            let regularTotalCol = isWalletOnly ? '' : totalCol;
            let walletTotalCol = isWalletOnly ? totalCol : '';
            
            // Push the processed transaction into our main data array
            data.push({
                date: dateCol,
                items: itemsCol,
                currency: currencyCol,
                regularPrice: regularPriceCol,
                walletPrice: walletPriceCol,
                discount: discountCol,
                tax: taxCol,
                methods: methods,
                regularTotal: regularTotalCol,
                walletTotal: walletTotalCol,
                walletChange: walletChangeCol,
                walletBalance: walletBalanceCol
            });
        });

        // Convert our Set of unique payment methods into an Array for header processing
        let pmArray = Array.from(paymentColumns);
        
        // Assemble the dynamic CSV Header row
        let header = ['Date', 'Items', 'Currency', 'Price', 'Wallet Price', 'Discount', 'Tax', ...pmArray, 'Total', 'Wallet Total', 'Wallet Change', 'Wallet Balance'];
        let csvStr = header.map(escapeCSV).join(',') + '\n';
        
        // Iterate through the data array and build the CSV strings
        data.forEach(row => {
            let rowArr = [
                row.date,
                row.items,
                row.currency,
                row.regularPrice,
                row.walletPrice,
                row.discount,
                row.tax
            ];
            
            // Align payment values under their respective dynamically generated columns
            pmArray.forEach(pm => {
                rowArr.push(row.methods[pm] || '');
            });
            
            rowArr.push(row.regularTotal);
            rowArr.push(row.walletTotal);
            rowArr.push(row.walletChange);
            rowArr.push(row.walletBalance);
            
            csvStr += rowArr.map(escapeCSV).join(',') + '\n';
        });

        // Scrape the dynamic header off the page for the base filename
        let headerEl = document.querySelector('h2.pageheader');
        let baseName = headerEl ? headerEl.innerText.trim() : 'Purchase History';
        let currentDateTime = formatForFileName(new Date());
        
        // Combine "Steam ", the base name, and the specific date format
        let finalFileName = `Steam ${baseName} ${currentDateTime}.csv`;

        // Create a blob and trigger an invisible anchor tag to download the file
        let blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
        let url = URL.createObjectURL(blob);
        let a = document.createElement('a');
        a.href = url;
        a.download = finalFileName;
        document.body.appendChild(a);
        a.click();
        
        // Clean up the DOM and Object URL after download
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
})();
