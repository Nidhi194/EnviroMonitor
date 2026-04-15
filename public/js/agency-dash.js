const appLayout = document.getElementById("appLayout");
const sidebarPanel = document.getElementById("sidebarPanel");
const sidebarToggleButton = document.getElementById("btnSidebarToggle");
const logoutButton = document.getElementById("btnLogout");
const searchInput = document.getElementById("inputSearchReports");
const reportsTableBody = document.getElementById("tbodyReports");
const tableSummaryText = document.getElementById("textTableSummary");
const tableEmptyState = document.getElementById("tableEmptyState");
const actionMenu = document.getElementById("reportActionMenu");
const btnNotifications = document.getElementById("btnNotifications");
const btnProfileMenu = document.getElementById("btnProfileMenu");
const btnHeaderProfile = document.getElementById("btnHeaderProfile");
const btnPagePrev = document.getElementById("btnPagePrev");
const btnPageNext = document.getElementById("btnPageNext");
const notificationsPanel = document.getElementById("notificationsPanel");
const profileDropdownPanel = document.getElementById("profileDropdownPanel");
const profileMenuLogout = document.getElementById("profileMenuLogout");

const totalReportsElement = document.getElementById("statTotalReports");
const activeReportsElement = document.getElementById("statActiveReports");
const pendingReportsElement = document.getElementById("statPendingReports");
const overdueReportsElement = document.getElementById("statOverdueReports");

const generateButtons = [
    document.getElementById("btnGenerateReport"),
    document.getElementById("btnNewReport"),
    document.getElementById("btnMenuGenerateReport")
].filter(Boolean);

const btnScheduleReport = document.getElementById("btnScheduleReport");
const btnExportCsv = document.getElementById("btnExportCsv");
const scheduleModal = document.getElementById("scheduleModal");
const btnCloseScheduleModal = document.getElementById("btnCloseScheduleModal");
const selectIndustry = document.getElementById("selectIndustry");
const checkDate = document.getElementById("checkDate");
const formScheduleCheck = document.getElementById("formScheduleCheck");

window.reportRows = Array.from(reportsTableBody.querySelectorAll("tr[data-report-row]"));
let rowActionButtons = Array.from(document.querySelectorAll(".btn-row-action"));
let selectedReportId = null;

const PAGE_SIZE = 10;
let currentPage = 0;
let lastDashboardSummary = { pendingReports: 0, overdueReports: 0, totalReports: 0 };

function syncReportTableView() {
    if (!tableSummaryText || !tableEmptyState) return;
    const allRows = window.reportRows || [];
    const query = (searchInput?.value || "").toLowerCase().trim();
    const matchingRows = allRows.filter((row) => query === "" || row.textContent.toLowerCase().includes(query));
    const totalMatching = matchingRows.length;
    const totalRows = allRows.length;
    const safeTotalPages = totalMatching === 0 ? 1 : Math.max(1, Math.ceil(totalMatching / PAGE_SIZE));
    if (currentPage >= safeTotalPages) currentPage = safeTotalPages - 1;
    if (currentPage < 0) currentPage = 0;

    const start = currentPage * PAGE_SIZE;
    const pageRows = matchingRows.slice(start, start + PAGE_SIZE);
    const pageSet = new Set(pageRows);

    allRows.forEach((row) => {
        const matchesSearch = query === "" || row.textContent.toLowerCase().includes(query);
        row.hidden = !matchesSearch || !pageSet.has(row);
    });

    if (totalMatching === 0) {
        tableEmptyState.hidden = totalRows !== 0;
        if (totalRows === 0) {
            tableSummaryText.textContent = "Showing 0 of 0 reports";
        } else {
            tableSummaryText.textContent = `No reports match your search (${totalRows} total)`;
        }
    } else {
        tableEmptyState.hidden = true;
        const end = start + pageRows.length;
        if (safeTotalPages > 1) {
            tableSummaryText.textContent = `Showing ${start + 1}–${end} of ${totalMatching} reports · Page ${currentPage + 1} of ${safeTotalPages}`;
        } else {
            tableSummaryText.textContent = `Showing ${totalMatching} of ${totalRows} reports`;
        }
    }

    if (btnPagePrev) btnPagePrev.disabled = currentPage <= 0 || totalMatching === 0;
    if (btnPageNext) btnPageNext.disabled = currentPage >= safeTotalPages - 1 || totalMatching === 0;
}

function filterReportRows() {
    currentPage = 0;
    syncReportTableView();
}

function closeActionMenu() {
    actionMenu.hidden = true;
    selectedReportId = null;
    rowActionButtons.forEach((button) => {
        button.setAttribute("aria-expanded", "false");
    });
}

function openActionMenu(triggerButton) {
    const rect = triggerButton.getBoundingClientRect();
    selectedReportId = triggerButton.value;

    const row = triggerButton.closest("tr");
    const completeBtn = document.getElementById("btnMenuComplete");
    if (completeBtn) {
        const isPending = row.querySelector(".status-draft") !== null;
        completeBtn.style.display = isPending ? "flex" : "none";
    }

    actionMenu.style.top = `${rect.bottom + 6}px`;
    actionMenu.style.left = `${Math.max(12, rect.right - actionMenu.offsetWidth)}px`;
    actionMenu.hidden = false;

    rowActionButtons.forEach((button) => {
        const isCurrent = button === triggerButton;
        button.setAttribute("aria-expanded", String(isCurrent));
    });
}

function bindRowActionMenu() {
    // Re-select all buttons each time to ensure dynamically added ones are hooked
    rowActionButtons = Array.from(document.querySelectorAll(".btn-row-action"));
    rowActionButtons.forEach((button) => {
        button.addEventListener("click", (event) => {
            event.stopPropagation();
            const isExpanded = button.getAttribute("aria-expanded") === "true";

            if (isExpanded) {
                closeActionMenu();
                return;
            }

            openActionMenu(button);
        });
    });

    // We only want to add these document listeners ONCE.
    if (!window.hasBoundDocumentActions) {
        actionMenu.addEventListener("click", async (event) => {
            const menuButton = event.target.closest("button");
            if (!menuButton) return;
            
            const action = menuButton.value;
            
            if (action === "complete") {
                window.location.href = "agency.html";
            } else if (action === "view" || action === "download") {
                try {
                    const res = await fetch(`/api/reports/summary/${selectedReportId}`);
                    if (!res.ok) throw new Error("Failed to fetch report summary");
                    const data = await res.json();
                    
                    if (data.error) throw new Error(data.error);

                    generatePDFFromData(data);
                } catch (err) {
                    console.error("View report error:", err);
                    alert("Error opening report. Ensure it exists in the database.");
                }
            } else if (action === "delete") {
                if (confirm("Are you sure you want to delete this report?")) {
                    try {
                        const res = await fetch(`/api/reports/${selectedReportId}`, {
                            method: 'DELETE'
                        });
                        
                        if (res.ok) {
                            alert("Report deleted successfully.");
                            loadLiveReports(); 
                        } else {
                            alert("Failed to delete report.");
                        }
                    } catch(err) {
                        console.error("Delete error:", err);
                        alert("Error deleting report.");
                    }
                }
            }
            
            closeActionMenu();
        });

        document.addEventListener("click", (event) => {
            const clickedActionButton = event.target.closest(".btn-row-action");
            const clickedActionMenu = event.target.closest("#reportActionMenu");

            if (!clickedActionButton && !clickedActionMenu) {
                closeActionMenu();
            }
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                closeActionMenu();
            }
        });

        window.addEventListener("resize", closeActionMenu);
        window.addEventListener("scroll", closeActionMenu, true);
        window.hasBoundDocumentActions = true;
    }
}

function bindSearchInput() {
    if (!searchInput) return;
    searchInput.addEventListener("input", filterReportRows);
}

function bindSidebarToggle() {
    if (!sidebarToggleButton) return;
    sidebarToggleButton.addEventListener("click", () => {
        appLayout.classList.toggle("sidebar-open");
        sidebarPanel.classList.toggle("is-open");
    });
}

function bindLogoutButton() {
    if (!logoutButton) return;
    logoutButton.addEventListener("click", () => {
        const shouldLogout = window.confirm("Are you sure you want to logout?");
        if (!shouldLogout) {
            return;
        }
        
        // Clear local storage for real logout
        localStorage.removeItem("userEmail");
        window.location.href = "index.html";
    });

    if (btnScheduleReport && scheduleModal) {
        btnScheduleReport.addEventListener("click", async () => {
            scheduleModal.hidden = false;
            // Set min date to today
            const today = new Date().toISOString().split("T")[0];
            checkDate.setAttribute("min", today);
            
            try {
                selectIndustry.innerHTML = '<option value="">Loading industries...</option>';
                const res = await fetch("/api/industries");
                if (res.ok) {
                    const industries = await res.json();
                    selectIndustry.innerHTML = '<option value="">Select an industry</option>';
                    industries.forEach(ind => {
                        const opt = document.createElement("option");
                        opt.value = JSON.stringify({ email: ind.user_email, name: ind.industry_name });
                        opt.textContent = ind.industry_name;
                        selectIndustry.appendChild(opt);
                    });
                }
            } catch (err) {
                console.error("Failed to load industries", err);
                selectIndustry.innerHTML = '<option value="">Failed to load. Try again.</option>';
            }
        });

        const closeModal = () => {
            scheduleModal.hidden = true;
            formScheduleCheck.reset();
        };

        btnCloseScheduleModal.addEventListener("click", closeModal);
        scheduleModal.addEventListener("click", (e) => {
            if (e.target === scheduleModal) closeModal();
        });

        formScheduleCheck.addEventListener("submit", async (e) => {
            e.preventDefault();
            const agencyEmail = localStorage.getItem("userEmail");
            const selectedOpt = JSON.parse(selectIndustry.value);
            const scheduledDate = checkDate.value;

            const payload = {
                agencyEmail,
                industryEmail: selectedOpt.email,
                industryName: selectedOpt.name,
                scheduledDate
            };

            try {
                const res = await fetch("/api/schedule-check", {
                    method: "POST",
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    alert("Check scheduled successfully!");
                    closeModal();
                    if (typeof loadAgencySchedules === 'function') loadAgencySchedules();
                } else {
                    alert(data.error || "Failed to schedule check.");
                }
            } catch (error) {
                console.error("Schedule error:", error);
                alert("Server error scheduling check.");
            }
        });
    }
}

function bindGenerateButtons() {
    generateButtons.forEach((button) => {
        button.addEventListener("click", () => {
            window.location.href = "agency.html";
        });
    });
}

function formatDate(dateValue) {
    if (!dateValue) return "N/A";
    const parsedDate = new Date(dateValue);
    if (Number.isNaN(parsedDate.getTime())) return dateValue;
    return parsedDate.toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' });
}

async function loadLiveReports() {
    const userEmail = localStorage.getItem("userEmail");
    if (!userEmail) {
        window.location.href = "h.html";
        return;
    }

    try {
        const res = await fetch(`/agency-dashboard-data?user_email=${encodeURIComponent(userEmail)}`);
        const data = await res.json();
        
        if (data.error) throw new Error(data.error);

        const reports = data.reports || [];
        const summary = data.summary || {};

        reportsTableBody.innerHTML = ""; // Clear mock data

        if (reports.length === 0) {
            lastDashboardSummary = {
                pendingReports: summary.pendingReports || 0,
                overdueReports: summary.overdueReports || 0,
                totalReports: summary.totalReports || 0
            };
            window.reportRows = [];
            currentPage = 0;
            syncReportTableView();
            if(totalReportsElement) totalReportsElement.textContent = "0";
            if(activeReportsElement) activeReportsElement.textContent = "0";
            if(pendingReportsElement) pendingReportsElement.textContent = "0";
            if(overdueReportsElement) overdueReportsElement.textContent = "0";
            
            const updateGaugeZero = (selector) => {
                const gaugeEl = document.querySelector(`.stat-card-radial.${selector} .radial-progress`);
                if (gaugeEl) {
                    gaugeEl.setAttribute('data-percentage', 0);
                    gaugeEl.style.strokeDashoffset = 125.6; // Full offset for 0%
                }
            };
            updateGaugeZero('gauge-total');
            updateGaugeZero('gauge-active');
            updateGaugeZero('gauge-pending');
            updateGaugeZero('gauge-overdue');
            
            return;
        }

        let html = '';
        reports.forEach((rpt, idx) => {
            const rptId = rpt.reportId || ('RPT-NEW-' + idx);
            const dateStr = formatDate(rpt.monitoringDate);
            const title = rpt.reportType || 'AQI Monitoring Report';
            const company = rpt.companyName || 'N/A';
            const statusBadgeClass = rpt.status === 'Pending' ? 'status-draft' : 'status-completed';
            html += `
                <tr data-report-row data-report-id="${rptId}">
                    <td>${title}</td>
                    <td>Environmental</td>
                    <td>${company}</td>
                    <td><span class="status-badge ${statusBadgeClass}"><i class="fa-solid fa-circle"></i>${rpt.status || 'Completed'}</span></td>
                    <td>${dateStr}</td>
                    <td class="sparkline-cell"><div class="sparkline-wrap"><canvas class="sparkline-canvas"></canvas></div></td>
                    <td class="actions-cell">
                        <button name="row_action" value="${rptId}" class="btn-row-action btn-action-pop" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Open row actions">
                            Manage <i class="fa-solid fa-caret-down"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        reportsTableBody.innerHTML = html;

        // Make sure row actions and filter variables know about the new rows
        const newRows = Array.from(reportsTableBody.querySelectorAll("tr[data-report-row]"));
        window.reportRows = newRows; 
        
        if(totalReportsElement) totalReportsElement.textContent = summary.totalReports || reports.length;
        if(activeReportsElement) activeReportsElement.textContent = summary.activeReports || reports.length;
        if(pendingReportsElement) pendingReportsElement.textContent = summary.pendingReports || "0";
        if(overdueReportsElement) overdueReportsElement.textContent = summary.overdueReports || "0";

        // Update radial gauges
        const updateGauge = (selector, count, total) => {
            const gaugeEl = document.querySelector(`.stat-card-radial.${selector} .radial-progress`);
            if (gaugeEl) {
                const percentage = total === 0 ? 0 : Math.round((count / total) * 100);
                gaugeEl.setAttribute('data-percentage', percentage);
                const PI2_R = 125.6; // 2 * PI * 20
                const offset = PI2_R - (percentage / 100) * PI2_R;
                gaugeEl.style.strokeDashoffset = offset;
            }
        };

        updateGauge('gauge-total', summary.totalReports || reports.length, Math.max(1, summary.totalReports || reports.length));
        updateGauge('gauge-active', summary.activeReports || reports.length, Math.max(1, summary.totalReports || reports.length));
        updateGauge('gauge-pending', summary.pendingReports || 0, Math.max(1, summary.totalReports || reports.length));
        updateGauge('gauge-overdue', summary.overdueReports || 0, Math.max(1, summary.totalReports || reports.length));

        lastDashboardSummary = {
            pendingReports: summary.pendingReports || 0,
            overdueReports: summary.overdueReports || 0,
            totalReports: summary.totalReports || reports.length
        };
        currentPage = 0;
        syncReportTableView();
        bindRowActionMenu(); // rebind buttons
        updateAlertTicker(reports, summary);

        // Initialize 7-day sparklines for newly injected rows
        if (typeof window.initSparklines === 'function') {
            setTimeout(() => window.initSparklines(), 100);
        }

    } catch (err) {
        console.error("Failed to load reports:", err);
    }
}

function updateAlertTicker(reports, summary) {
    const track = document.getElementById("alertTickerTrack");
    if (!track) return;

    let items = [];
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

    if (summary.pendingReports > 0) {
        items.push(`<span><i class="fa-solid fa-triangle-exclamation" style="color:#f59e0b"></i> [${timeStr}] ACTION REQUIRED: You have ${summary.pendingReports} pending draft report(s) awaiting completion.</span>`);
    }

    if (summary.overdueReports > 0) {
        items.push(`<span><i class="fa-solid fa-circle-exclamation" style="color:#ef4444"></i> [${timeStr}] CRITICAL: ${summary.overdueReports} reports are currently overdue for processing!</span>`);
    }

    const completed = reports.filter(r => r.status && r.status.toLowerCase() !== 'pending').slice(0, 3);
    completed.forEach(r => {
        items.push(`<span><i class="fa-solid fa-circle-check" style="color:#10b981"></i> [${timeStr}] VERIFIED: Environmental report for ${r.companyName} (${r.reportId}) successfully logged and finalized.</span>`);
    });

    if (items.length === 0) {
        items.push(`<span><i class="fa-solid fa-shield-halved" style="color:#3b82f6"></i> [${timeStr}] SYSTEM CLEAR: All sensor networks operating within normal bounds. Database synchronized properly.</span>`);
    }

    // Duplicate elements implicitly to naturally allow CSS infinite track looping
    track.innerHTML = items.concat(items).join("");
}

function generatePDFFromData(data) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert("Please allow popups to generate PDF reports.");
        return;
    }

    const baseUrl = window.location.origin + window.location.pathname.replace(/\/pages\/.*$/, '');
    const bgUrl = baseUrl + '/images/report-bg.svg';

    const cssStyles = `
        <style>
            @page { size: A4; margin: 0; }
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
            body { 
                font-family: 'Inter', sans-serif; 
                padding: 180px 60px 80px 60px; 
                color: #1e293b; 
                margin: 0; 
                line-height: 1.6; 
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                height: 100%;
                box-sizing: border-box;
            }
            .bg-image {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: -1;
            }
            .header { text-align: center; margin-bottom: 30px; margin-top: 50px; }
            .header h1 { margin: 0; color: #1D6B4E; font-size: 28px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
            .header p { margin: 5px 0 0; color: #308a68; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 2px; }
            .section { margin-bottom: 20px; }
            .section-title { font-size: 18px; color: #1D6B4E; border-bottom: 2px solid #1D6B4E; padding-bottom: 5px; margin-bottom: 15px; font-weight: 800; text-transform: uppercase; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px; }
            table th, table td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #e2e8f0; }
            table th { background-color: #f1f7f4; font-weight: 600; color: #1D6B4E; }
            .overview-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 30px; }
            .overview-item { padding: 15px; background: rgba(255, 255, 255, 0.85); border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
            .overview-label { font-size: 12px; font-weight: 600; color: #308a68; text-transform: uppercase; margin-bottom: 5px; }
            .overview-value { font-size: 18px; font-weight: 700; color: #1D6B4E; }
            .footer { display: none; }
        </style>
    `;

    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>AQI Comprehensive Report - ${data.industryName}</title>
            ${cssStyles}
        </head>
        <body>
            <img src="${bgUrl}" class="bg-image" alt="background">
            <div style="position: relative; z-index: 1;">
                <div class="header">
                    <h1>Comprehensive AQI Monitoring Report</h1>
                    <p>Generated by EnviroMonitor Agency Panel</p>
                </div>

                <div class="overview-grid">
                    <div class="overview-item">
                        <div class="overview-label">Industry Name</div>
                        <div class="overview-value">${data.industryName}</div>
                    </div>
                    <div class="overview-item">
                        <div class="overview-label">Location / Site</div>
                        <div class="overview-value">${data.location}</div>
                    </div>
                    <div class="overview-item">
                        <div class="overview-label">Monitoring Date</div>
                        <div class="overview-value">${data.monitoringDate}</div>
                    </div>
                    <div class="overview-item">
                        <div class="overview-label">Report Validity</div>
                        <div class="overview-value">Verified & Finalized</div>
                    </div>
                </div>

                <div class="section">
                    <h2 class="section-title">Table of Contents</h2>
                    <ul>
                        <li>1. Industry Overview</li>
                        <li>2. PM10 Determination Results</li>
                        <li>3. SO₂ Determination Results</li>
                        <li>4. NO₂ Determination Results</li>
                        <li>5. PM2.5 Determination Results</li>
                    </ul>
                </div>

                <div class="section">
                    <h2 class="section-title">Summary of Environmental Parameters</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>Parameter</th>
                                <th>Average Concentration (µg/m³)</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>PM10</td>
                                <td>${data.pm10Avg}</td>
                                <td>Recorded</td>
                            </tr>
                            <tr>
                                <td>Sulfur Dioxide (SO₂)</td>
                                <td>${data.so2Avg}</td>
                                <td>Recorded</td>
                            </tr>
                            <tr>
                                <td>Nitrogen Dioxide (NO₂)</td>
                                <td>${data.no2Avg}</td>
                                <td>Recorded</td>
                            </tr>
                            <tr>
                                <td>PM2.5</td>
                                <td>${data.pm25Val}</td>
                                <td>Recorded</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                
                <div class="footer">
                    <p>This is a certified digital report generated via the AQI Reporting Interface.</p>
                </div>
            </div>
            <script>
                window.onload = () => {
                    window.print();
                    setTimeout(() => window.close(), 500);
                }
            </script>
        </body>
        </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
}

function bindExportCsv() {
    if (!btnExportCsv) return;
    btnExportCsv.addEventListener("click", () => {
        const visibleRows = Array.from(reportsTableBody.querySelectorAll("tr[data-report-row]")).filter(row => !row.hidden);
        
        if (visibleRows.length === 0) {
            alert("No reports available to export.");
            return;
        }

        const headers = ["Report Title", "Type", "Company", "Status", "Monitoring Date"];
        let csvContent = headers.join(",") + "\n";

        visibleRows.forEach(row => {
            const title = row.cells[0].innerText.trim().replace(/,/g, " ");
            const type = row.cells[1].innerText.trim().replace(/,/g, " ");
            const company = row.cells[2].innerText.trim().replace(/,/g, " ");
            const status = row.cells[3].innerText.trim().replace(/,/g, " ");
            const date = row.cells[4].innerText.trim();

            csvContent += `${title},${type},${company},${status},${date}\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Agency_Reports_Export_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
}

function positionDropdown(anchor, panel) {
    if (!anchor || !panel) return;
    const r = anchor.getBoundingClientRect();
    const approxWidth = Math.max(panel.offsetWidth || 260, 200);
    const left = Math.min(window.innerWidth - approxWidth - 12, Math.max(12, r.right - approxWidth));
    panel.style.position = "fixed";
    panel.style.top = `${r.bottom + 6}px`;
    panel.style.left = `${left}px`;
}

function closeAllHeaderDropdowns() {
    if (notificationsPanel) notificationsPanel.hidden = true;
    if (profileDropdownPanel) profileDropdownPanel.hidden = true;
}

function fillNotificationsPanel() {
    const body = document.getElementById("notificationsPanelBody");
    if (!body) return;
    const p = lastDashboardSummary.pendingReports || 0;
    const o = lastDashboardSummary.overdueReports || 0;
    const t = lastDashboardSummary.totalReports ?? 0;
    const parts = [
        `<p><strong>${t}</strong> report(s) in your workspace.</p>`
    ];
    if (p > 0) {
        parts.push(`<p><i class="fa-solid fa-triangle-exclamation" style="color:#f59e0b"></i> <strong>${p}</strong> draft report(s) pending completion.</p>`);
    }
    if (o > 0) {
        parts.push(`<p><i class="fa-solid fa-circle-exclamation" style="color:#ef4444"></i> <strong>${o}</strong> report(s) flagged overdue.</p>`);
    }
    if (p === 0 && o === 0) {
        parts.push("<p>No urgent items. Alerts also scroll in the ticker above.</p>");
    }
    body.innerHTML = parts.join("");
}

function bindNotificationsAndProfileMenus() {
    if (btnNotifications && notificationsPanel) {
        btnNotifications.addEventListener("click", (e) => {
            e.stopPropagation();
            const willShow = notificationsPanel.hidden;
            closeAllHeaderDropdowns();
            if (willShow) {
                fillNotificationsPanel();
                notificationsPanel.hidden = false;
                positionDropdown(btnNotifications, notificationsPanel);
            }
        });
    }

    function openProfileFrom(anchor) {
        closeAllHeaderDropdowns();
        profileDropdownPanel.hidden = false;
        positionDropdown(anchor, profileDropdownPanel);
    }

    if (btnProfileMenu && profileDropdownPanel) {
        btnProfileMenu.addEventListener("click", (e) => {
            e.stopPropagation();
            if (!profileDropdownPanel.hidden) {
                closeAllHeaderDropdowns();
            } else {
                openProfileFrom(btnProfileMenu);
            }
        });
    }

    if (btnHeaderProfile && profileDropdownPanel) {
        btnHeaderProfile.addEventListener("click", (e) => {
            e.stopPropagation();
            if (!profileDropdownPanel.hidden) {
                closeAllHeaderDropdowns();
            } else {
                openProfileFrom(btnHeaderProfile);
            }
        });
    }

    if (profileMenuLogout) {
        profileMenuLogout.addEventListener("click", (e) => {
            e.stopPropagation();
            closeAllHeaderDropdowns();
            logoutButton?.click();
        });
    }

    document.addEventListener("click", (ev) => {
        if (ev.target.closest("#notificationsPanel, #btnNotifications, #profileDropdownPanel, #btnProfileMenu, #btnHeaderProfile")) return;
        closeAllHeaderDropdowns();
    });
    window.addEventListener("resize", closeAllHeaderDropdowns);
}

function bindPaginationControls() {
    if (btnPagePrev) {
        btnPagePrev.addEventListener("click", () => {
            if (currentPage > 0) {
                currentPage -= 1;
                syncReportTableView();
            }
        });
    }
    if (btnPageNext) {
        btnPageNext.addEventListener("click", () => {
            currentPage += 1;
            syncReportTableView();
        });
    }
}

function initializeDashboard() {
    bindSearchInput();
    bindSidebarToggle();
    bindLogoutButton();
    bindGenerateButtons();
    bindExportCsv();
    bindNotificationsAndProfileMenus();
    bindPaginationControls();
    loadLiveReports();

    if (typeof loadAgencySchedules === 'function') {
        loadAgencySchedules();
    }
}

async function loadAgencySchedules() {
    const userEmail = localStorage.getItem("userEmail");
    if (!userEmail) return;

    const tbody = document.getElementById("tbodySchedules");
    const emptyState = document.getElementById("tableSchedulesEmptyState");
    if (!tbody || !emptyState) return;

    try {
        const res = await fetch(`/api/agency-schedules?agency_email=${encodeURIComponent(userEmail)}`);
        const data = await res.json();

        const schedules = data.schedules || [];
        tbody.innerHTML = "";

        if (schedules.length === 0) {
            emptyState.hidden = false;
            return;
        }

        emptyState.hidden = true;
        let html = "";
        schedules.forEach(sc => {
            const dateStr = formatDate(sc.scheduled_date);
            let statusColor = "#f59e0b"; // pending orange
            let actions = `
                <button class="btn btn-secondary btn-schedule-complete" data-id="${sc.id}" style="color:#10b981; font-size: 0.75rem; border: 1px solid #10b981; padding: 4px 8px;"><i class="fa-solid fa-check"></i> Complete</button>
                <button class="btn btn-secondary btn-schedule-cancel" data-id="${sc.id}" style="color:#ef4444; font-size: 0.75rem; border: 1px solid #ef4444; padding: 4px 8px;"><i class="fa-solid fa-xmark"></i> Cancel</button>
            `;
            if (sc.status === "Completed") {
                statusColor = "#10b981";
                actions = `<span style="color:#10b981; font-size: 0.8rem; font-weight:800;"><i class="fa-solid fa-check-double"></i> Done</span>`;
            } else if (sc.status === "Cancelled") {
                statusColor = "#64748b";
                actions = `<span style="color:#64748b; font-size: 0.8rem; font-weight:800;"><i class="fa-solid fa-ban"></i> Cancelled</span>`;
            }

            html += `
                <tr style="border-bottom: 1px solid rgba(0,0,0,0.05);">
                    <td style="font-weight: 700; color: #1e293b;">${sc.industry_name}</td>
                    <td><i class="fa-regular fa-calendar" style="color: #64748b; margin-right: 4px;"></i> ${dateStr}</td>
                    <td><span class="status-badge" style="background: ${statusColor}15; color: ${statusColor}; padding: 4px 10px; border-radius: 6px;"><i class="fa-solid fa-circle" style="font-size:0.5rem; margin-right:4px; vertical-align:middle;"></i> ${sc.status}</span></td>
                    <td style="display: flex; gap: 8px; align-items: center; min-height: 48px;">${actions}</td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
        bindScheduleActionButtons();
    } catch (e) {
        console.error("Failed to load schedules", e);
    }
}

function bindScheduleActionButtons() {
    document.querySelectorAll(".btn-schedule-complete").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            await updateScheduleStatus(e.target.closest("button").dataset.id, "Completed");
        });
    });
    document.querySelectorAll(".btn-schedule-cancel").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            await updateScheduleStatus(e.target.closest("button").dataset.id, "Cancelled");
        });
    });
}

async function updateScheduleStatus(id, status) {
    const agencyEmail = localStorage.getItem("userEmail");
    try {
        const res = await fetch(`/api/schedule-check/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status, agencyEmail })
        });
        if (res.ok) {
            loadAgencySchedules(); // Reload table
        }
    } catch (e) {
        console.error("Failed to update status", e);
    }
}

window.AgencyDashboard = {
    clearReports: () => {
        reportsTableBody.innerHTML = "";
        window.reportRows = [];
        currentPage = 0;
        syncReportTableView();
    },
    loadLiveReports
};

initializeDashboard();
