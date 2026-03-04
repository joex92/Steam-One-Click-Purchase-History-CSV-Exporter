// ==UserScript==
// @name         Steam Purchase History Exporter
// @namespace    https://github.com/joex92/Steam-One-Click-Purchase-History-CSV-Exporter
// @version      1.0
// @description  Export Steam account purchase history to a CSV file.
// @author       You
// @match        https://store.steampowered.com/account/history*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Wait for the page to finish loading before adding the button
    window.addEventListener('load', () => {
        let btn = document.createElement('button');
        btn.innerText = 'Export to CSV';
        btn.style.position = 'fixed';
        btn.style.bottom = '20px';
        btn.style.right = '20px';
        btn.style.padding = '12px 24px';
        btn.style.backgroundColor = '#66c0f4';
        btn.style.color = '#171a21';
        btn.style.border = 'none';
        btn.style.borderRadius = '5px';
        btn.style.fontSize = '14px';
        btn.style.fontWeight = 'bold';
        btn.style.cursor = 'pointer';
        btn.style.zIndex = '9999';
        btn.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';

        btn.addEventListener('mouseover', () => { if (!btn.disabled) btn.style.backgroundColor = '#41a8e6'; });
        btn.addEventListener('mouseout', () => { if (!btn.disabled) btn.style.backgroundColor = '#66c0f4'; });

        btn.addEventListener('click', () => {
            btn.innerText = 'Loading all records... Please wait.';
            btn.disabled = true;
            btn.style.backgroundColor = '#555';
            btn.style.color = '#ccc';
            
            // Start scrolling to trigger lazy loading
            loadAllRecords(() => {
                btn.innerText = 'Processing...';
                setTimeout(() => {
                    exportDataToCSV();
                    btn.innerText = 'Export to CSV';
                    btn.disabled = false;
                    btn.style.backgroundColor = '#66c0f4';
                    btn.style.color = '#171a21';
                }, 500);
            });
        });

        document.body.appendChild(btn);
    });

    // Automatically scrolls down to load all items
    function loadAllRecords(callback) {
        let prevHeight = 0;
        let unchangedCount = 0;
        
        let interval = setInterval(() => {
            window.scrollTo(0, document.body.scrollHeight);
            
            // If the "Load More" button is visible, click it as a fallback
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
                    callback();
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
        let paymentColumns = new Set(); // Stores all unique payment methods discovered

        rows.forEach(row => {
            let dateCol = row.querySelector('.wht_date') ? row.querySelector('.wht_date').innerText.trim() : '';
            
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
                        // Split by 2 or more spaces/tabs which reliably separates amount from source in Steam's raw HTML
                        let parts = text.split(/\s{2,}/);
                        
                        if (parts.length >= 2) {
                            let method = parts.slice(1).join(' ').trim(); 
                            methods[method] = parts[0].trim();
                            paymentColumns.add(method);
                        } else if (text) {
                            // Regex fallback just in case formatting behaves weirdly
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
                    // Single method for the whole row
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

        // Export/Download sequence
        let blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
        let url = URL.createObjectURL(blob);
        let a = document.createElement('a');
        a.href = url;
        a.download = 'Steam_Purchase_History.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
})();
