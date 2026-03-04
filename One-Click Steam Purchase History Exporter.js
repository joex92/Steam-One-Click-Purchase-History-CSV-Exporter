// ==UserScript==
// @name         Steam Purchase History Exporter
// @namespace    https://github.com/joex92/Steam-One-Click-Purchase-History-CSV-Exporter
// @version      1.1
// @description  Export Steam account purchase history to a CSV file.
// @author       JoeX92 & Gemini AI Pro
// @match        https://store.steampowered.com/account/history*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Formats a Date object to YYYY/MM/DD HH:MM:SS
    function formatToYYYYMMDDHHMMSS(date) {
        let yyyy = date.getFullYear();
        let mm = String(date.getMonth() + 1).padStart(2, '0');
        let dd = String(date.getDate()).padStart(2, '0');
        let hh = String(date.getHours()).padStart(2, '0');
        let min = String(date.getMinutes()).padStart(2, '0');
        let ss = String(date.getSeconds()).padStart(2, '0');
        return `${yyyy}/${mm}/${dd} ${hh}:${min}:${ss}`;
    }

    // Parses Steam's date string and formats it to the requested layout
    function parseAndFormatSteamDate(steamDateStr) {
        if (!steamDateStr) return "";
        let d = new Date(steamDateStr);
        
        // If the year is missing (Steam sometimes omits it for the current year)
        if (isNaN(d.getTime())) {
            d = new Date(steamDateStr + ", " + new Date().getFullYear());
            if (isNaN(d.getTime())) return steamDateStr; // Fallback if still invalid
        }
        return formatToYYYYMMDDHHMMSS(d);
    }

    // Wait for the page to finish loading before adding the UI
    window.addEventListener('load', () => {
        let container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.bottom = '20px';
        container.style.right = '20px';
        container.style.display = 'flex';
        container.style.gap = '10px';
        container.style.zIndex = '9999';

        let startBtn = document.createElement('button');
        startBtn.innerText = 'Export to CSV';
        styleButton(startBtn, '#66c0f4', '#171a21');

        let pauseBtn = document.createElement('button');
        pauseBtn.innerText = 'Pause';
        pauseBtn.style.display = 'none';
        styleButton(pauseBtn, '#e6c841', '#171a21');

        let stopBtn = document.createElement('button');
        stopBtn.innerText = 'Stop & Export';
        stopBtn.style.display = 'none';
        styleButton(stopBtn, '#e64141', '#ffffff');

        container.appendChild(startBtn);
        container.appendChild(pauseBtn);
        container.appendChild(stopBtn);
        document.body.appendChild(container);

        let isPaused = false;
        let isStopped = false;

        startBtn.addEventListener('click', () => {
            startBtn.style.display = 'none';
            pauseBtn.style.display = 'block';
            stopBtn.style.display = 'block';
            isPaused = false;
            isStopped = false;
            
            // Start scrolling to trigger lazy loading
            loadAllRecords(
                // Pause check callback
                () => isPaused,
                // Stop check callback
                () => isStopped,
                // Completion/Stop callback
                () => {
                    exportDataToCSV();
                    // Reset UI
                    startBtn.style.display = 'block';
                    pauseBtn.style.display = 'none';
                    stopBtn.style.display = 'none';
                    pauseBtn.innerText = 'Pause';
                }
            );
        });

        pauseBtn.addEventListener('click', () => {
            isPaused = !isPaused;
            pauseBtn.innerText = isPaused ? 'Resume' : 'Pause';
        });

        stopBtn.addEventListener('click', () => {
            isStopped = true;
            stopBtn.innerText = 'Exporting...';
            stopBtn.disabled = true;
        });
    });

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
        
        btn.addEventListener('mouseover', () => { if (!btn.disabled) btn.style.filter = 'brightness(1.1)'; });
        btn.addEventListener('mouseout', () => { if (!btn.disabled) btn.style.filter = 'brightness(1)'; });
    }

    // Automatically scrolls down to load items with pause/stop control
    function loadAllRecords(getIsPaused, getIsStopped, onComplete) {
        let prevHeight = 0;
        let unchangedCount = 0;
        
        let interval = setInterval(() => {
            if (getIsStopped()) {
                clearInterval(interval);
                onComplete();
                return;
            }

            if (getIsPaused()) {
                return; // Skip this tick if paused
            }

            window.scrollTo(0, document.body.scrollHeight);
            
            // If the "Load More" button is visible, click it
            let loadMoreBtn = document.getElementById('load_more_button');
            if (loadMoreBtn && window.getComputedStyle(loadMoreBtn).display !== 'none') {
                loadMoreBtn.click();
            }
            
            let currentHeight = document.body.scrollHeight;
            let loadingEl = document.getElementById('wallet_history_loading');
            let isLoading = loadingEl && window.getComputedStyle(loadingEl).display !== 'none';

            // Wait until the scroll height hasn't changed for ~6 seconds and nothing is loading
            if (currentHeight === prevHeight && !isLoading) {
                unchangedCount++;
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

    // Helper for formatting CSV data cleanly
    function escapeCSV(value) {
        if (value == null) return '""';
        let str = value.toString().trim().replace(/"/g, '""');
        return `"${str}"`;
    }

    // Gathers DOM data, organizes dynamically generated headers, and initiates download
    function exportDataToCSV() {
        let rows = document.querySelectorAll('.wallet_history_table tbody tr.wallet_table_row');
        let data = [];
        let paymentColumns = new Set(); 

        rows.forEach(row => {
            let rawDate = row.querySelector('.wht_date') ? row.querySelector('.wht_date').innerText.trim() : '';
            let dateCol = parseAndFormatSteamDate(rawDate);
            
            let itemsCol = '';
            let itemsTd = row.querySelector('.wht_items');
            if (itemsTd) {
                // Steam items are separated by divs; replace new lines with pipes " | "
                itemsCol = itemsTd.innerText.trim().replace(/\s*\n\s*/g, ' | ');
            }
            
            let priceCol = '';
            let discountCol = '';
            let basePriceTd = row.querySelector('.wht_base_price');
            
            if (basePriceTd) {
                let discountedDiv = basePriceTd.querySelector('.wht_base_price_discounted');
                if (discountedDiv) {
                    let dPct = discountedDiv.querySelector('.wht_discount_pct');
                    let pOrig = discountedDiv.querySelector('.wht_original_price');
                    discountCol = dPct ? dPct.innerText.trim() : '';
                    priceCol = pOrig ? pOrig.innerText.trim() : '';
                } else {
                    priceCol = basePriceTd.innerText.trim();
                }
            }
            
            let taxCol = row.querySelector('.wht_tax') ? row.querySelector('.wht_tax').innerText.trim() : '';
            let totalCol = row.querySelector('.wht_total') ? row.querySelector('.wht_total').innerText.trim() : '';
            let walletChangeCol = row.querySelector('.wht_wallet_change') ? row.querySelector('.wht_wallet_change').innerText.trim() : '';
            let walletBalanceCol = row.querySelector('.wht_wallet_balance') ? row.querySelector('.wht_wallet_balance').innerText.trim() : '';

            // Handle mixed/multiple payment methods dynamically
            let methods = {};
            let paymentDiv = row.querySelector('.wht_type .wth_payment');
            
            if (paymentDiv) {
                let subDivs = paymentDiv.querySelectorAll('div');
                if (subDivs.length > 0) {
                    subDivs.forEach(div => {
                        let text = div.textContent.trim();
                        // Split by 2 or more spaces/tabs which reliably separates amount from source
                        let parts = text.split(/\s{2,}/);
                        
                        if (parts.length >= 2) {
                            let method = parts.slice(1).join(' ').trim(); 
                            methods[method] = parts[0].trim();
                            paymentColumns.add(method);
                        } else if (text) {
                            let match = text.match(/^([^\d]*?\s*\d+[.,\d]*\s*[A-Za-z]*)\s+(.*)$/);
                            if (match) {
                                let method = match[2].trim();
                                methods[method] = match[1].trim();
                                paymentColumns.add(method);
                            } else {
                                methods[text] = totalCol;
                                paymentColumns.add(text);
                            }
                        }
                    });
                } else {
                    let method = paymentDiv.textContent.trim();
                    if (method) {
                        methods[method] = totalCol;
                        paymentColumns.add(method);
                    }
                }
            }
            
            data.push({
                date: dateCol,
                items: itemsCol,
                price: priceCol,
                discount: discountCol,
                tax: taxCol,
                methods: methods,
                total: totalCol,
                walletChange: walletChangeCol,
                walletBalance: walletBalanceCol
            });
        });

        // Set up the rearranged headers
        let pmArray = Array.from(paymentColumns);
        let header = ['Date', 'Items', 'Price', 'Discount', 'Tax', ...pmArray, 'Total', 'Wallet Change', 'Wallet Balance'];
        
        let csvStr = header.map(escapeCSV).join(',') + '\n';
        
        data.forEach(row => {
            let rowArr = [
                row.date,
                row.items,
                row.price,
                row.discount,
                row.tax
            ];
            
            // Line up the dynamic column payments
            pmArray.forEach(pm => {
                rowArr.push(row.methods[pm] || '');
            });
            
            rowArr.push(row.total);
            rowArr.push(row.walletChange);
            rowArr.push(row.walletBalance);
            
            csvStr += rowArr.map(escapeCSV).join(',') + '\n';
        });

        // Determine File Name
        let headerEl = document.querySelector('h2.pageheader');
        let baseName = headerEl ? headerEl.innerText.trim() : 'Steam Purchase History';
        let currentDateTime = formatToYYYYMMDDHHMMSS(new Date());
        
        // Use the requested format. (Note: Many OS replace the '/' and ':' with '_' or '-' when saving files automatically)
        let finalFileName = `${baseName} ${currentDateTime}.csv`;

        // Export/Download sequence
        let blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
        let url = URL.createObjectURL(blob);
        let a = document.createElement('a');
        a.href = url;
        a.download = finalFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
})();
