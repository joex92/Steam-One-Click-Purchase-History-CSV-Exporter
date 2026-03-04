// ==UserScript==
// @name         Steam Purchase History Exporter
// @namespace    https://github.com/joex92/Steam-One-Click-Purchase-History-CSV-Exporter
// @version      1.4
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
            if (isNaN(d.getTime())) return steamDateStr; 
        }
        return formatToYYYYMMDDHHMMSS(d);
    }

    // Extracts only the numeric portion of a price string (including minus signs, decimals, commas)
    function extractNumber(str) {
        if (!str) return '';
        let match = str.match(/-?[\d.,]+/);
        return match ? match[0] : '';
    }

    // Extracts the currency code (e.g., USD) or symbol from a string
    function extractCurrency(str) {
        if (!str) return '';
        let match = str.match(/[A-Z]{3}/i);
        if (match) return match[0].toUpperCase();
        
        let symMatch = str.match(/[$€£¥]/);
        return symMatch ? symMatch[0] : '';
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
                () => isPaused,
                () => isStopped,
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
