/* Merged from h, industry, and agency files for cleaner structure */

/* Lightweight same-origin page transition */
(() => {
    const FADE_MS = 170;

    function smoothNavigate(url) {
        if (!url) return;
        document.body.classList.add("page-transitioning");
        setTimeout(() => {
            window.location.href = url;
        }, FADE_MS);
    }

    document.addEventListener("click", (event) => {
        const link = event.target.closest("a[href]");
        if (!link) return;

        const href = (link.getAttribute("href") || "").trim();
        if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
        if (link.target === "_blank" || link.hasAttribute("download")) return;

        const url = new URL(link.href, window.location.href);
        if (url.origin !== window.location.origin) return;
        if (url.href === window.location.href) return;

        event.preventDefault();
        smoothNavigate(url.href);
    });

    window.smoothNavigate = smoothNavigate;
})();

const PROFESSIONAL_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const EMAIL_VALIDATION_MESSAGE = "Please enter a valid professional email address";

function normalizeEmail(value) {
    return String(value || "").trim();
}

function isValidProfessionalEmail(value) {
    const email = normalizeEmail(value);
    if (!email || /\s/.test(email)) return false;
    return PROFESSIONAL_EMAIL_REGEX.test(email);
}

function validateEmailInputElement(input) {
    if (!input) return false;
    const normalized = normalizeEmail(input.value);
    if (input.value !== normalized) input.value = normalized;

    const isValid = isValidProfessionalEmail(normalized);
    input.setCustomValidity(isValid ? "" : EMAIL_VALIDATION_MESSAGE);
    return isValid;
}

function ensureEmailInputValid(input) {
    const isValid = validateEmailInputElement(input);
    if (!isValid) {
        input.reportValidity();
        input.focus();
    }
    return isValid;
}

function setupGlobalEmailValidation() {
    document.querySelectorAll('input[type="email"]').forEach((input) => {
        input.setAttribute("pattern", "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}");
        input.setAttribute("title", EMAIL_VALIDATION_MESSAGE);

        input.addEventListener("input", () => {
            validateEmailInputElement(input);
        });

        input.addEventListener("change", () => {
            validateEmailInputElement(input);
        });

        input.addEventListener("blur", () => {
            const hasValue = normalizeEmail(input.value) !== "";
            const isValid = validateEmailInputElement(input);
            if (hasValue && !isValid) {
                input.reportValidity();
            }
        });

        validateEmailInputElement(input);
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupGlobalEmailValidation);
} else {
    setupGlobalEmailValidation();
}

/* Home Page Logic */
(() => {
    if (!document.getElementById('loginForm')) {
        return;
    }

// SWITCH FORMS
function showRegister() {
    document.getElementById("loginForm").style.display = "none";
    document.getElementById("registerForm").style.display = "block";
    document.getElementById("title").innerText = "Sign Up";
    document.getElementById("result").innerText = "";
    document.getElementById("result").style.color = "#dc2626";
}

function showLogin() {
    document.getElementById("registerForm").style.display = "none";
    document.getElementById("loginForm").style.display = "block";
    document.getElementById("title").innerText = "Login";
    document.getElementById("result").innerText = "";
    document.getElementById("result").style.color = "#dc2626";
}

// REGISTER
async function register() {
    const regEmailInput = document.getElementById("regEmail");
    let email = normalizeEmail(regEmailInput?.value);
    if (regEmailInput) regEmailInput.value = email;
    let password = document.getElementById("regPassword").value.trim();
    let confirmPassword = document.getElementById("confirmPassword").value.trim();
    let role = document.getElementById("role").value;

    if (!email || !password || !confirmPassword || !role) {
        alert("Please fill all fields");
        return;
    }

    if (password !== confirmPassword) {
        alert("Passwords do not match!");
        return;
    }

    if (!ensureEmailInputValid(regEmailInput)) {
        return;
    }

    try {
        let res = await fetch("/register", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ email, password, role })
        });

        let data = await res.json();

        if (data.error) {
            document.getElementById("result").style.color = "#dc2626";
            document.getElementById("result").innerText = data.error;
        } else {
            document.getElementById("result").style.color = "#16a34a";
            document.getElementById("result").innerText = data.message;
            alert(data.message);

            document.getElementById("regEmail").value = "";
            document.getElementById("regPassword").value = "";
            document.getElementById("confirmPassword").value = "";
            document.getElementById("role").value = "";

            showLogin();
        }
    } catch (error) {
        console.log(error);
        document.getElementById("result").style.color = "#dc2626";
        document.getElementById("result").innerText = "Server connection error";
    }
}

// LOGIN
async function login() {
    const loginEmailInput = document.getElementById("loginEmail");
    let email = normalizeEmail(loginEmailInput?.value);
    if (loginEmailInput) loginEmailInput.value = email;
    let password = document.getElementById("loginPassword").value.trim();

    if (!email || !password) {
        document.getElementById("result").style.color = "#dc2626";
        document.getElementById("result").innerText = "Please enter email and password";
        return;
    }

    if (!ensureEmailInputValid(loginEmailInput)) {
        document.getElementById("result").style.color = "#dc2626";
        document.getElementById("result").innerText = EMAIL_VALIDATION_MESSAGE;
        return;
    }

    try {
        let res = await fetch("/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ email, password })
        });

        let data = await res.json();

        if (data.success) {
            localStorage.setItem("userEmail", data.email);
            if (data.token) localStorage.setItem("authToken", data.token);
            let basePath = (window.location.protocol.startsWith('http') && window.location.pathname === '/') ? 'pages/' : '';

            if (data.role === "Industry") {
                window.location.href = basePath + (data.redirectPage || "industry.html");
            } else if (data.role === "Monitoring Agency") {
                try {
                    let profileRes = await fetch("/check-agency-profile", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": "Bearer " + data.token
                        },
                        body: JSON.stringify({ email: data.email })
                    });
                    let profileData = await profileRes.json();
                    if (profileData.exists) {
                        window.location.href = basePath + "agency-dash.html";
                    } else {
                        window.location.href = basePath + "agency-info.html";
                    }
                } catch {
                    window.location.href = basePath + "agency-info.html";
                }
            } else {
                document.getElementById("result").style.color = "#dc2626";
                document.getElementById("result").innerText = "Unknown role";
            }
        } else {
            document.getElementById("result").style.color = "#dc2626";
            document.getElementById("result").innerText = data.error || "Invalid login";
        }
    } catch (error) {
        console.log(error);
        document.getElementById("result").style.color = "#dc2626";
        document.getElementById("result").innerText = "Server connection error";
    }
}


    window.showRegister = showRegister;
    window.showLogin = showLogin;
    window.register = register;
    window.login = login;
})();

/* Shared Logic */
window.logout = function() {
    localStorage.removeItem("userEmail");
    localStorage.removeItem("authToken");
    window.location.href = "index.html";
};

window.openSection = function(sectionId, clickedItem) {
    document.getElementById(sectionId).scrollIntoView({
        behavior: "smooth",
        block: "start"
    });

    document.querySelectorAll(".nav-item").forEach(item => {
        item.classList.remove("active");
    });

    if (clickedItem) {
        clickedItem.classList.add("active");
    }
};

function isIndustryEditMode() {
    const params = new URLSearchParams(window.location.search);
    return params.get("edit") === "1";
}

function setIndustryIdLocked(isLocked) {
    const industryIdInput = document.getElementById("industry_id");
    const hint = document.getElementById("industryIdLockHint");

    if (!industryIdInput) return;

    industryIdInput.readOnly = Boolean(isLocked);
    industryIdInput.style.backgroundColor = isLocked ? "#f8fafc" : "";
    industryIdInput.style.cursor = isLocked ? "not-allowed" : "";

    if (hint) {
        hint.style.display = isLocked ? "block" : "none";
    }
}

function populateIndustryProfile(profile = {}) {
    const mapping = {
        industry_name: "industry_name",
        industry_type: "industry_type",
        industry_id: "industry_id",
        address: "address",
        contact_name: "contact_name",
        role_designation: "role_designation",
        email: "email",
        phone: "phone",
        alt_phone: "alt_phone",
        monitoring_frequency: "monitoring_frequency",
        notification_pref: "notification_pref"
    };

    Object.entries(mapping).forEach(([profileKey, elementId]) => {
        const el = document.getElementById(elementId);
        if (el && profile[profileKey] !== undefined && profile[profileKey] !== null) {
            el.value = String(profile[profileKey]);
        }
    });

    const nameDisplay = document.getElementById("industryNameDisplay");
    if (nameDisplay) {
        nameDisplay.textContent = profile.industry_name || localStorage.getItem("userEmail") || "Industry User";
    }

    if (typeof window.updateProgress === "function") {
        window.updateProgress();
    }
}

async function handleIndustryEntryFlow() {
    const userEmail = (localStorage.getItem("userEmail") || "").trim();

    if (!userEmail) {
        window.location.href = "h.html";
        return;
    }

    const editing = isIndustryEditMode();

    try {
        const res = await fetch(`/industry-profile-status?user_email=${encodeURIComponent(userEmail)}`);
        const result = await res.json();

        if (!res.ok) {
            throw new Error(result.error || "Could not load industry profile");
        }

        if (result.hasIndustryProfile && result.profile) {
            if (!editing) {
                window.location.replace("industry-reports.html");
                return;
            }

            populateIndustryProfile(result.profile);
            setIndustryIdLocked(true);

            const title = document.getElementById("industryPageTitle");
            const subtitle = document.getElementById("industryPageSubtitle");
            const saveBtn = document.getElementById("saveIndustryBtn");

            if (title) title.textContent = "Update Industry Profile";
            if (subtitle) subtitle.textContent = "Review and update your saved industry details. Industry ID / Registration Number stays locked to preserve the original record.";
            if (saveBtn) saveBtn.textContent = "Update Profile";
            return;
        }

        setIndustryIdLocked(false);
    } catch (error) {
        console.log("Industry profile status check failed:", error);
    }
}

window.saveAgencyProfile = async function() {
    let userEmail = localStorage.getItem("userEmail");
    const agencyEmailInput = document.getElementById("email");
    const normalizedUserEmail = normalizeEmail(userEmail);
    const normalizedAgencyEmail = normalizeEmail(agencyEmailInput?.value);
    if (agencyEmailInput) agencyEmailInput.value = normalizedAgencyEmail;

    let data = {
        user_email: normalizedUserEmail,
        agency_name: document.getElementById("agency_name").value.trim(),
        owner_name: document.getElementById("owner_name").value.trim(),
        email: normalizedAgencyEmail,
        phone: document.getElementById("phone").value.trim()
    };

    let missingFields = [];
    if (!data.agency_name) missingFields.push("Agency Name");
    if (!data.owner_name) missingFields.push("Owner Name");
    if (!data.email) missingFields.push("Email ID");
    if (!data.phone) missingFields.push("Phone Number");

    if (missingFields.length > 0) {
        alert("Please fill the following required fields:\n\n" + missingFields.join("\n"));
        return;
    }

    if (!isValidProfessionalEmail(data.user_email)) {
        alert("Session email is invalid. Please login again.");
        window.location.href = "h.html";
        return;
    }

    if (!ensureEmailInputValid(agencyEmailInput)) {
        return;
    }

    try {
        const token = localStorage.getItem("authToken") || "";
        let res = await fetch("/save-agency-profile", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + token
            },
            body: JSON.stringify(data)
        });

        let result = await res.json();
        if (result.error) {
            alert(result.error);
        } else {
            alert("Profile saved successfully.");
            window.location.href = "agency-dash.html";
        }
    } catch (error) {
        console.log(error);
        alert("Server connection error");
    }
};

/* Industry Page Logic */
(() => {
    if (!document.getElementById('industrySection')) {
        return;
    }



function updateProgress() {
    const fieldIds = [
        "industry_name",
        "industry_type",
        "industry_id",
        "address",
        "contact_name",
        "role_designation",
        "email",
        "phone",
        "alt_phone",
        "monitoring_frequency",
        "notification_pref"
    ];

    let filled = 0;

    fieldIds.forEach(id => {
        const el = document.getElementById(id);
        if (el && el.value.trim() !== "") {
            filled++;
        }
    });

    const percent = Math.round((filled / fieldIds.length) * 100);
    document.getElementById("progressFill").style.width = percent + "%";
    document.getElementById("progressText").innerText = percent + "%";
}

window.updateProgress = updateProgress;

document.querySelectorAll("input, select, textarea").forEach(el => {
    el.addEventListener("input", updateProgress);
    el.addEventListener("change", updateProgress);
});

function highlightSectionByField(fieldName) {
    const industryFields = ["industry_name", "industry_type", "industry_id", "address"];
    const contactFields = ["contact_name", "role_designation", "email", "phone", "alt_phone"];
    const complianceFields = ["monitoring_frequency", "notification_pref"];

    if (industryFields.includes(fieldName)) {
        document.getElementById("industrySection").scrollIntoView({ behavior: "smooth", block: "start" });
        setActiveSidebar(0);
    } else if (contactFields.includes(fieldName)) {
        document.getElementById("contactSection").scrollIntoView({ behavior: "smooth", block: "start" });
        setActiveSidebar(1);
    } else if (complianceFields.includes(fieldName)) {
        document.getElementById("complianceSection").scrollIntoView({ behavior: "smooth", block: "start" });
        setActiveSidebar(2);
    }
}

function setActiveSidebar(index) {
    const items = document.querySelectorAll(".nav-item");
    items.forEach(item => item.classList.remove("active"));
    if (items[index]) {
        items[index].classList.add("active");
    }
}

handleIndustryEntryFlow();
updateProgress();

async function saveData() {
    let userEmail = localStorage.getItem("userEmail");
    const industryEmailInput = document.getElementById("email");
    const normalizedUserEmail = normalizeEmail(userEmail);
    const normalizedIndustryEmail = normalizeEmail(industryEmailInput?.value);
    if (industryEmailInput) industryEmailInput.value = normalizedIndustryEmail;

    let data = {
        user_email: normalizedUserEmail,
        industry_name: document.getElementById("industry_name").value.trim(),
        industry_type: document.getElementById("industry_type").value.trim(),
        industry_id: document.getElementById("industry_id").value.trim(),
        address: document.getElementById("address").value.trim(),
        contact_name: document.getElementById("contact_name").value.trim(),
        role_designation: document.getElementById("role_designation").value.trim(),
        email: normalizedIndustryEmail,
        phone: document.getElementById("phone").value.trim(),
        alt_phone: document.getElementById("alt_phone").value.trim(),
        monitoring_frequency: document.getElementById("monitoring_frequency").value.trim(),
        notification_pref: document.getElementById("notification_pref").value.trim()
    };

    let missingFields = [];

    if (!data.user_email) missingFields.push({ key: "user_email", label: "User Login Email" });
    if (!data.industry_name) missingFields.push({ key: "industry_name", label: "Industry Name" });
    if (!data.industry_type) missingFields.push({ key: "industry_type", label: "Industry Type" });
    if (!data.industry_id) missingFields.push({ key: "industry_id", label: "Industry ID / Registration Number" });
    if (!data.address) missingFields.push({ key: "address", label: "Location / Address" });
    if (!data.contact_name) missingFields.push({ key: "contact_name", label: "Contact Person Name" });
    if (!data.role_designation) missingFields.push({ key: "role_designation", label: "Role / Designation" });
    if (!data.email) missingFields.push({ key: "email", label: "Email ID" });
    if (!data.phone) missingFields.push({ key: "phone", label: "Primary Phone Number" });
    if (!data.monitoring_frequency) missingFields.push({ key: "monitoring_frequency", label: "AQI Monitoring Frequency" });
    if (!data.notification_pref) missingFields.push({ key: "notification_pref", label: "Notification Preference" });

    if (missingFields.length > 0) {
        highlightSectionByField(missingFields[0].key);
        alert("Please fill the following required fields:\n\n" + missingFields.map(field => field.label).join("\n"));
        return;
    }

    if (!isValidProfessionalEmail(data.user_email)) {
        alert("Session email is invalid. Please login again.");
        window.location.href = "h.html";
        return;
    }

    if (!ensureEmailInputValid(industryEmailInput)) {
        highlightSectionByField("email");
        return;
    }

    try {
        const token = localStorage.getItem("authToken") || "";
        let res = await fetch("/save-industry", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + token
            },
            body: JSON.stringify(data)
        });

        let result = await res.json();
        if (result.error) {
            alert(result.error);
            return;
        }

        alert(result.message || 'Profile saved successfully');

        if (result.redirectPage) {
            let basePath = (window.location.protocol.startsWith('http') && window.location.pathname === '/') ? 'pages/' : '';
            window.location.href = basePath + result.redirectPage;
        } else {
            let basePath = (window.location.protocol.startsWith('http') && window.location.pathname === '/') ? 'pages/' : '';
            window.location.href = basePath + "industry-reports.html";
        }
    } catch (error) {
        console.log(error);
        alert("Server connection error");
    }
}

async function submitForReview() {
    let userEmail = localStorage.getItem("userEmail");
    const industryEmailInput = document.getElementById("email");
    const normalizedUserEmail = normalizeEmail(userEmail);
    const normalizedIndustryEmail = normalizeEmail(industryEmailInput?.value);
    if (industryEmailInput) industryEmailInput.value = normalizedIndustryEmail;

    let data = {
        user_email: normalizedUserEmail,
        industry_name: document.getElementById("industry_name").value.trim(),
        industry_type: document.getElementById("industry_type").value.trim(),
        industry_id: document.getElementById("industry_id").value.trim(),
        address: document.getElementById("address").value.trim(),
        contact_name: document.getElementById("contact_name").value.trim(),
        role_designation: document.getElementById("role_designation").value.trim(),
        email: normalizedIndustryEmail,
        phone: document.getElementById("phone").value.trim(),
        alt_phone: document.getElementById("alt_phone").value.trim(),
        monitoring_frequency: document.getElementById("monitoring_frequency").value.trim(),
        notification_pref: document.getElementById("notification_pref").value.trim()
    };

    let missingFields = [];

    if (!data.user_email) missingFields.push({ key: "user_email", label: "User Login Email" });
    if (!data.industry_name) missingFields.push({ key: "industry_name", label: "Industry Name" });
    if (!data.industry_type) missingFields.push({ key: "industry_type", label: "Industry Type" });
    if (!data.industry_id) missingFields.push({ key: "industry_id", label: "Industry ID / Registration Number" });
    if (!data.address) missingFields.push({ key: "address", label: "Location / Address" });
    if (!data.contact_name) missingFields.push({ key: "contact_name", label: "Contact Person Name" });
    if (!data.role_designation) missingFields.push({ key: "role_designation", label: "Role / Designation" });
    if (!data.email) missingFields.push({ key: "email", label: "Email ID" });
    if (!data.phone) missingFields.push({ key: "phone", label: "Primary Phone Number" });
    if (!data.monitoring_frequency) missingFields.push({ key: "monitoring_frequency", label: "AQI Monitoring Frequency" });
    if (!data.notification_pref) missingFields.push({ key: "notification_pref", label: "Notification Preference" });

    if (missingFields.length > 0) {
        highlightSectionByField(missingFields[0].key);
        alert("Please fill the following required fields before submitting for review:\n\n" + missingFields.map(field => field.label).join("\n"));
        return;
    }

    if (!isValidProfessionalEmail(data.user_email)) {
        alert("Session email is invalid. Please login again.");
        window.location.href = "h.html";
        return;
    }

    if (!ensureEmailInputValid(industryEmailInput)) {
        highlightSectionByField("email");
        return;
    }

    try {
        let res = await fetch("/submit-industry-review", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(data)
        });

        let result = await res.json();
        if (result.error) {
            alert(result.error);
            return;
        }

        alert(result.message || "Profile submitted for review.");

        if (result.redirectPage) {
            let basePath = (window.location.protocol.startsWith('http') && window.location.pathname === '/') ? 'pages/' : '';
            window.location.href = basePath + result.redirectPage;
        } else {
            let basePath = (window.location.protocol.startsWith('http') && window.location.pathname === '/') ? 'pages/' : '';
            window.location.href = basePath + "industry-reports.html";
        }
    } catch (error) {
        console.log(error);
        alert("Server connection error");
    }
}


    window.saveData = saveData;
    window.submitForReview = submitForReview;
})();

/* Agency Page Logic */
(() => {
    if (!document.getElementById('agencyNav')) {
        return;
    }

async function loadIndustries() {
    try {
        let res = await fetch("/get-industries");
        let data = await res.json();

        let dropdown = document.getElementById("industry_name");
        dropdown.innerHTML = '<option value="">Select Industry</option>';

        data.forEach(item => {
            let option = document.createElement("option");
            option.value = item.industry_name;
            option.text = item.industry_name;
            dropdown.appendChild(option);
        });
    } catch (error) {
        console.log("Error loading industries:", error);
        alert("Could not load industries");
    }
}

loadIndustries();

const industryLocationMap = {
    manufacturing: "Industrial Zone",
    chemical: "Chemical Estate",
    "cement & construction": "Industrial Zone",
    "steel & metallurgy": "Metal Park",
    textile: "Textile Cluster",
    "paper & pulp": "Paper Industrial Area",
    pharmaceutical: "Pharma Hub",
    "power generation": "Power Plant Zone",
    it: "Tech Park"
};

function getAutofillLocation(industryValue) {
    const normalized = (industryValue || "").trim().toLowerCase();
    if (!normalized) return "";

    if (industryLocationMap[normalized]) {
        return industryLocationMap[normalized];
    }

    const keywordMatch = Object.keys(industryLocationMap).find(key => normalized.includes(key));
    if (keywordMatch) {
        return industryLocationMap[keywordMatch];
    }

    return `${industryValue.trim()} Location`;
}

function setupIndustryLocationAutofill() {
    const industryDropdown = document.getElementById("industry_name");
    const locationInput = document.getElementById("location");

    if (!industryDropdown || !locationInput) return;

    industryDropdown.addEventListener("change", (event) => {
        const selectedIndustry = event.target.value;
        locationInput.value = getAutofillLocation(selectedIndustry);
        syncSixColumnLocations(locationInput.value);
    });
}

function syncSixColumnLocations(locationValue) {
    const value = (locationValue || "").trim();

    for (let i = 1; i <= 3; i++) {
        const pmLoc = document.getElementById(`pm_loc_${i}`);
        if (pmLoc) pmLoc.value = value;
    }

    for (let i = 1; i <= 6; i++) {
        const soLoc = document.getElementById(`so_loc_${i}`);
        const noLoc = document.getElementById(`no_loc_${i}`);
        if (soLoc) soLoc.value = value;
        if (noLoc) noLoc.value = value;
    }

    const pm25Loc = document.getElementById("pm25_loc_1");
    if (pm25Loc) pm25Loc.value = value;
}

function setupSixColumnLocationBinding() {
    const locationInput = document.getElementById("location");
    if (!locationInput) return;

    const syncHandler = () => syncSixColumnLocations(locationInput.value);
    locationInput.addEventListener("input", syncHandler);
    locationInput.addEventListener("change", syncHandler);
    syncHandler();
}

function syncSamplingTimePair(prefix, index) {
    const startInput = document.getElementById(`${prefix}_time_start_${index}`);
    const endInput = document.getElementById(`${prefix}_time_end_${index}`);
    const combinedInput = document.getElementById(`${prefix}_time_${index}`);

    if (!startInput || !endInput || !combinedInput) return;

    const start = startInput.value;
    const end = endInput.value;

    if (start && end) {
        combinedInput.value = `${start} - ${end}`;
    } else {
        combinedInput.value = start || end || "";
    }
}

function setupSixColumnTimeSync(prefix) {
    for (let i = 1; i <= 6; i++) {
        const startInput = document.getElementById(`${prefix}_time_start_${i}`);
        const endInput = document.getElementById(`${prefix}_time_end_${i}`);

        if (startInput) {
            startInput.addEventListener("input", () => syncSamplingTimePair(prefix, i));
            startInput.addEventListener("change", () => syncSamplingTimePair(prefix, i));
        }

        if (endInput) {
            endInput.addEventListener("input", () => syncSamplingTimePair(prefix, i));
            endInput.addEventListener("change", () => syncSamplingTimePair(prefix, i));
        }

        syncSamplingTimePair(prefix, i);
    }
}

// Enable arrow key navigation across table inputs
function enableTableArrowKeyNavigation() {
    const isNavigableInput = (el) => {
        return el && el.tagName === "INPUT" && el.type !== "hidden" && !el.disabled;
    };

    const getCellRange = (row, targetCell) => {
        let start = 0;
        for (const cell of row.cells) {
            const span = cell.colSpan || 1;
            const end = start + span - 1;
            if (cell === targetCell) {
                return { start, end };
            }
            start += span;
        }
        return null;
    };

    const findCellByColumn = (row, columnIndex) => {
        let start = 0;
        for (const cell of row.cells) {
            const span = cell.colSpan || 1;
            const end = start + span - 1;
            if (columnIndex >= start && columnIndex <= end) {
                return cell;
            }
            start += span;
        }
        return null;
    };

    const getNavigableInputs = (root) => {
        return Array.from(root.querySelectorAll("input"))
            .filter(isNavigableInput);
    };

    const focusInput = (input) => {
        if (!input) return;
        input.focus();
        if (typeof input.select === "function" && (input.type === "text" || input.type === "number" || input.type === "time")) {
            input.select();
        }
    };

    document.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
        if (event.altKey || event.ctrlKey || event.metaKey) return;

        const currentInput = event.target;
        if (!isNavigableInput(currentInput)) return;

        const table = currentInput.closest("table");
        const currentCell = currentInput.closest("td, th");
        const currentRow = currentInput.closest("tr");
        if (!table || !currentCell || !currentRow) return;

        const rows = Array.from(table.querySelectorAll("tr"));
        const rowIndex = rows.indexOf(currentRow);
        if (rowIndex === -1) return;

        let nextInput = null;

        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            const rowInputs = getNavigableInputs(currentRow);
            const inputIndex = rowInputs.indexOf(currentInput);
            if (inputIndex === -1) return;

            const delta = event.key === "ArrowRight" ? 1 : -1;
            nextInput = rowInputs[inputIndex + delta] || null;
        } else {
            const currentRange = getCellRange(currentRow, currentCell);
            if (!currentRange) return;

            const currentCellInputs = getNavigableInputs(currentCell);
            const inCellIndex = Math.max(0, currentCellInputs.indexOf(currentInput));
            const step = event.key === "ArrowDown" ? 1 : -1;

            for (let i = rowIndex + step; i >= 0 && i < rows.length; i += step) {
                const candidateRow = rows[i];
                const candidateCell = findCellByColumn(candidateRow, currentRange.start);
                if (!candidateCell) continue;

                const candidateInputs = getNavigableInputs(candidateCell);
                if (!candidateInputs.length) continue;

                nextInput = candidateInputs[Math.min(inCellIndex, candidateInputs.length - 1)];
                break;
            }
        }

        if (!nextInput) return;

        event.preventDefault();
        focusInput(nextInput);
    });
}

function validateCommonFields() {
    const industry = document.getElementById("industry_name").value.trim();
    const location = document.getElementById("location").value.trim();
    const date = document.getElementById("date").value.trim();

    if (!industry || !location || !date) {
        alert("Please fill Industry, Location and Date first");
        return false;
    }
    return true;
}

function calculatePM10() {
    let pmValues = [];

    for (let i = 1; i <= 3; i++) {
        let q1 = parseFloat(document.getElementById("q1_" + i).value) || 0;
        let q2 = parseFloat(document.getElementById("q2_" + i).value) || 0;
        let w1 = parseFloat(document.getElementById("w1_" + i).value) || 0;
        let w2 = parseFloat(document.getElementById("w2_" + i).value) || 0;

        let T = 480;
        let avg = (q1 + q2) / 2;
        let V = avg * T;
        let dust = w2 - w1;

        let pm = 0;
        if (V !== 0) {
            pm = ((w2 - w1) / V) * Math.pow(10, 6);
        }

        document.getElementById("avg" + i).innerText = avg.toFixed(2);
        document.getElementById("v" + i).innerText = V.toFixed(2);
        document.getElementById("dust" + i).innerText = dust.toFixed(4);
        document.getElementById("pm" + i).innerText = pm.toFixed(2);

        pmValues.push(pm);
    }

    let avgPM = (pmValues[0] + pmValues[1] + pmValues[2]) / 3;
    document.getElementById("avgPM").innerText = avgPM.toFixed(2);
}

function calculateSO2() {
    let soValues = [];

    for (let i = 1; i <= 6; i++) {
        let es = parseFloat(document.getElementById("es" + i).value) || 0;
        let cf = parseFloat(document.getElementById("cf" + i).value) || 0;
        let q = parseFloat(document.getElementById("qso" + i).value) || 0;
        let t = parseFloat(document.getElementById("t" + i).value) || 0;
        let vs = parseFloat(document.getElementById("vs" + i).value) || 0;
        let vt = parseFloat(document.getElementById("vt" + i).value) || 0;

        let A = es * cf;
        let VA = q * t * 60;
        let so2 = (VA !== 0 && vt !== 0) ? (A * vs * 1000) / (VA * vt) : 0;

        document.getElementById("a" + i).innerText = A.toFixed(2);
        document.getElementById("va" + i).innerText = VA.toFixed(2);
        document.getElementById("so" + i).innerText = so2.toFixed(2);

        soValues.push(so2);
    }

    let total = 0;
    for (let i = 0; i < soValues.length; i++) {
        total += soValues[i];
    }

    let avgSO2 = total / soValues.length;
    document.getElementById("avgSO2").innerText = avgSO2.toFixed(2);
}

function calculateNO2() {
    let noValues = [];

    for (let i = 1; i <= 6; i++) {
        let as = parseFloat(document.getElementById("as" + i).value) || 0;
        let cf = parseFloat(document.getElementById("ncf" + i).value) || 0;
        let q = parseFloat(document.getElementById("nq" + i).value) || 0;
        let t = parseFloat(document.getElementById("not" + i).value) || 0;
        let vs = parseFloat(document.getElementById("nvs" + i).value) || 0;
        let vt = parseFloat(document.getElementById("nvt" + i).value) || 0;

        let X = as * cf;
        let Va = q * t * 60;
        let no2 = (Va !== 0 && vt !== 0) ? (X * vs * 1000) / (Va * vt * 0.82) : 0;

        document.getElementById("x" + i).innerText = X.toFixed(2);
        document.getElementById("nva" + i).innerText = Va.toFixed(2);
        document.getElementById("no" + i).innerText = no2.toFixed(2);

        noValues.push(no2);
    }

    let total = 0;
    for (let i = 0; i < noValues.length; i++) {
        total += noValues[i];
    }

    let avgNO2 = total / noValues.length;
    document.getElementById("avgNO2").innerText = avgNO2.toFixed(2);
}

function calculatePM25() {
    let q1 = parseFloat(document.getElementById("pm25_q1_1").value) || 0;
    let q2 = parseFloat(document.getElementById("pm25_q2_1").value) || 0;
    let w1 = parseFloat(document.getElementById("pm25_w1_1").value) || 0;
    let w2 = parseFloat(document.getElementById("pm25_w2_1").value) || 0;

    let T = 1440;

    let avg = (q1 + q2) / 2;
    let V = avg * T;
    let dust = w2 - w1;

    let pm25 = 0;
    if (V !== 0) {
        pm25 = ((w2 - w1) * Math.pow(10, 6)) / V;
    }

    document.getElementById("pm25_avg1").innerText = avg.toFixed(2);
    document.getElementById("pm25_v1").innerText = V.toFixed(2);
    document.getElementById("pm25_dust1").innerText = dust.toFixed(4);
    document.getElementById("pm25_1").innerText = pm25.toFixed(2);
}

function validateTimeRange(fromInput, toInput, errorElement) {
    if (!fromInput || !toInput || !errorElement) return true;

    const fromVal = fromInput.value;
    const toVal = toInput.value;

    fromInput.classList.remove('time-invalid');
    toInput.classList.remove('time-invalid');
    errorElement.innerText = "";

    if (!fromVal || !toVal) {
        return true; 
    }

    if (toVal <= fromVal) {
        errorElement.innerText = "To time must be later than From time.";
        fromInput.classList.add('time-invalid');
        toInput.classList.add('time-invalid');
        return false;
    }

    const group = fromInput.closest('.time-range-group');
    if (group) {
        const hiddenInput = group.querySelector('input[type="hidden"]');
        if (hiddenInput) {
            hiddenInput.value = `${fromVal} - ${toVal}`;
        }
    }

    return true;
}

function validateAllSamplingTimeRanges() {
    let allValid = true;
    document.querySelectorAll('.time-range-group').forEach(group => {
        const inputs = group.querySelectorAll('input[type="time"]');
        const errorEl = group.querySelector('.time-validation');
        if (inputs.length === 2 && errorEl) {
            if (!validateTimeRange(inputs[0], inputs[1], errorEl)) {
                allValid = false;
            }
        }
    });
    return allValid;
}

function setupSamplingTimeRangeControls() {
    const groups = document.querySelectorAll('.time-range-group');
    groups.forEach(group => {
        const inputs = group.querySelectorAll('input[type="time"]');
        const errorEl = group.querySelector('.time-validation');
        if (inputs.length === 2 && errorEl) {
            const runner = () => validateTimeRange(inputs[0], inputs[1], errorEl);
            inputs.forEach(input => {
                input.addEventListener('input', runner);
                input.addEventListener('change', runner);
            });
            runner();
        }
    });
}

async function savePM10() {
    if (!validateCommonFields()) return;

    if (!validateAllSamplingTimeRanges()) {
        alert("Please correct invalid PM10 sampling time ranges.");
        return;
    }

    calculatePM10();

    const data = {
        user_email: localStorage.getItem("userEmail"),
        industry_name: document.getElementById("industry_name").value,
        location: document.getElementById("location").value,
        monitoring_date: document.getElementById("date").value,

        q1_1: document.getElementById("q1_1").value,
        q2_1: document.getElementById("q2_1").value,
        w1_1: document.getElementById("w1_1").value,
        w2_1: document.getElementById("w2_1").value,

        q1_2: document.getElementById("q1_2").value,
        q2_2: document.getElementById("q2_2").value,
        w1_2: document.getElementById("w1_2").value,
        w2_2: document.getElementById("w2_2").value,

        q1_3: document.getElementById("q1_3").value,
        q2_3: document.getElementById("q2_3").value,
        w1_3: document.getElementById("w1_3").value,
        w2_3: document.getElementById("w2_3").value
    };

    try {
        const res = await fetch("/save-pm10", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(data)
        });

        const result = await res.json();
        alert(result.message || result.error);
    } catch (error) {
        console.log("PM10 Save Error:", error);
        alert("Error saving PM10 data");
    }
}

async function saveSO2() {
    if (!validateCommonFields()) return;

    if (!validateAllSamplingTimeRanges()) {
        alert("Please correct invalid time ranges.");
        return;
    }

    calculateSO2();

    const data = {
        user_email: localStorage.getItem("userEmail"),
        industry_name: document.getElementById("industry_name").value,
        location: document.getElementById("location").value,
        monitoring_date: document.getElementById("date").value,

        duration_1: document.getElementById("t1").value,
        es_1: document.getElementById("es1").value,
        cf_1: document.getElementById("cf1").value,
        a_1: document.getElementById("a1").innerText,
        q_1: document.getElementById("qso1").value,
        va_1: document.getElementById("va1").innerText,
        vs_1: document.getElementById("vs1").value,
        vt_1: document.getElementById("vt1").value,
        so2_1: document.getElementById("so1").innerText,

        duration_2: document.getElementById("t2").value,
        es_2: document.getElementById("es2").value,
        cf_2: document.getElementById("cf2").value,
        a_2: document.getElementById("a2").innerText,
        q_2: document.getElementById("qso2").value,
        va_2: document.getElementById("va2").innerText,
        vs_2: document.getElementById("vs2").value,
        vt_2: document.getElementById("vt2").value,
        so2_2: document.getElementById("so2").innerText,

        duration_3: document.getElementById("t3").value,
        es_3: document.getElementById("es3").value,
        cf_3: document.getElementById("cf3").value,
        a_3: document.getElementById("a3").innerText,
        q_3: document.getElementById("qso3").value,
        va_3: document.getElementById("va3").innerText,
        vs_3: document.getElementById("vs3").value,
        vt_3: document.getElementById("vt3").value,
        so2_3: document.getElementById("so3").innerText,

        duration_4: document.getElementById("t4").value,
        es_4: document.getElementById("es4").value,
        cf_4: document.getElementById("cf4").value,
        a_4: document.getElementById("a4").innerText,
        q_4: document.getElementById("qso4").value,
        va_4: document.getElementById("va4").innerText,
        vs_4: document.getElementById("vs4").value,
        vt_4: document.getElementById("vt4").value,
        so2_4: document.getElementById("so4").innerText,

        duration_5: document.getElementById("t5").value,
        es_5: document.getElementById("es5").value,
        cf_5: document.getElementById("cf5").value,
        a_5: document.getElementById("a5").innerText,
        q_5: document.getElementById("qso5").value,
        va_5: document.getElementById("va5").innerText,
        vs_5: document.getElementById("vs5").value,
        vt_5: document.getElementById("vt5").value,
        so2_5: document.getElementById("so5").innerText,

        duration_6: document.getElementById("t6").value,
        es_6: document.getElementById("es6").value,
        cf_6: document.getElementById("cf6").value,
        a_6: document.getElementById("a6").innerText,
        q_6: document.getElementById("qso6").value,
        va_6: document.getElementById("va6").innerText,
        vs_6: document.getElementById("vs6").value,
        vt_6: document.getElementById("vt6").value,
        so2_6: document.getElementById("so6").innerText,

        avg_so2: document.getElementById("avgSO2").innerText
    };

    try {
        const res = await fetch("/save-so2", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(data)
        });

        const result = await res.json();
        alert(result.message || result.error);
    } catch (error) {
        console.log("SO2 Save Error:", error);
        alert("Error saving SO2 data");
    }
}

async function saveNO2() {
    if (!validateCommonFields()) return;

    if (!validateAllSamplingTimeRanges()) {
        alert("Please correct invalid time ranges.");
        return;
    }

    calculateNO2();

    const data = {
        user_email: localStorage.getItem("userEmail"),
        industry_name: document.getElementById("industry_name").value,
        location: document.getElementById("location").value,
        monitoring_date: document.getElementById("date").value,

        duration_1: document.getElementById("not1").value,
        as_1: document.getElementById("as1").value,
        cf_1: document.getElementById("ncf1").value,
        x_1: document.getElementById("x1").innerText,
        q_1: document.getElementById("nq1").value,
        va_1: document.getElementById("nva1").innerText,
        vs_1: document.getElementById("nvs1").value,
        vt_1: document.getElementById("nvt1").value,
        no2_1: document.getElementById("no1").innerText,

        duration_2: document.getElementById("not2").value,
        as_2: document.getElementById("as2").value,
        cf_2: document.getElementById("ncf2").value,
        x_2: document.getElementById("x2").innerText,
        q_2: document.getElementById("nq2").value,
        va_2: document.getElementById("nva2").innerText,
        vs_2: document.getElementById("nvs2").value,
        vt_2: document.getElementById("nvt2").value,
        no2_2: document.getElementById("no2").innerText,

        duration_3: document.getElementById("not3").value,
        as_3: document.getElementById("as3").value,
        cf_3: document.getElementById("ncf3").value,
        x_3: document.getElementById("x3").innerText,
        q_3: document.getElementById("nq3").value,
        va_3: document.getElementById("nva3").innerText,
        vs_3: document.getElementById("nvs3").value,
        vt_3: document.getElementById("nvt3").value,
        no2_3: document.getElementById("no3").innerText,

        duration_4: document.getElementById("not4").value,
        as_4: document.getElementById("as4").value,
        cf_4: document.getElementById("ncf4").value,
        x_4: document.getElementById("x4").innerText,
        q_4: document.getElementById("nq4").value,
        va_4: document.getElementById("nva4").innerText,
        vs_4: document.getElementById("nvs4").value,
        vt_4: document.getElementById("nvt4").value,
        no2_4: document.getElementById("no4").innerText,

        duration_5: document.getElementById("not5").value,
        as_5: document.getElementById("as5").value,
        cf_5: document.getElementById("ncf5").value,
        x_5: document.getElementById("x5").innerText,
        q_5: document.getElementById("nq5").value,
        va_5: document.getElementById("nva5").innerText,
        vs_5: document.getElementById("nvs5").value,
        vt_5: document.getElementById("nvt5").value,
        no2_5: document.getElementById("no5").innerText,

        duration_6: document.getElementById("not6").value,
        as_6: document.getElementById("as6").value,
        cf_6: document.getElementById("ncf6").value,
        x_6: document.getElementById("x6").innerText,
        q_6: document.getElementById("nq6").value,
        va_6: document.getElementById("nva6").innerText,
        vs_6: document.getElementById("nvs6").value,
        vt_6: document.getElementById("nvt6").value,
        no2_6: document.getElementById("no6").innerText,

        avg_no2: document.getElementById("avgNO2").innerText
    };

    try {
        const res = await fetch("/save-no2", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(data)
        });

        const result = await res.json();
        alert(result.message || result.error);
    } catch (error) {
        console.log("NO2 Save Error:", error);
        alert("Error saving NO2 data");
    }
}

async function savePM25() {
    if (!validateCommonFields()) return;

    if (!validateAllSamplingTimeRanges()) {
        alert("Please correct invalid time ranges.");
        return;
    }

    calculatePM25();

    const data = {
        user_email: localStorage.getItem("userEmail"),
        industry_name: document.getElementById("industry_name").value,
        location: document.getElementById("location").value,
        monitoring_date: document.getElementById("date").value,

        q1: document.getElementById("pm25_q1_1").value,
        q2: document.getElementById("pm25_q2_1").value,
        w1: document.getElementById("pm25_w1_1").value,
        w2: document.getElementById("pm25_w2_1").value
    };

    try {
        const res = await fetch("/save-pm25", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(data)
        });

        const result = await res.json();
        alert(result.message || result.error);
    } catch (error) {
        console.log("PM2.5 Save Error:", error);
        alert("Error saving PM2.5 data");
    }
}

function collectAgencyReportPayload() {
    return {
        user_email: localStorage.getItem('userEmail') || '',
        industry_name: document.getElementById("industry_name").value,
        location: document.getElementById("location").value,
        monitoring_date: document.getElementById("date").value,
        pm10: {
            q1_1: document.getElementById("q1_1").value,
            q2_1: document.getElementById("q2_1").value,
            w1_1: document.getElementById("w1_1").value,
            w2_1: document.getElementById("w2_1").value,
            q1_2: document.getElementById("q1_2").value,
            q2_2: document.getElementById("q2_2").value,
            w1_2: document.getElementById("w1_2").value,
            w2_2: document.getElementById("w2_2").value,
            q1_3: document.getElementById("q1_3").value,
            q2_3: document.getElementById("q2_3").value,
            w1_3: document.getElementById("w1_3").value,
            w2_3: document.getElementById("w2_3").value
        },
        so2: {
            duration_1: document.getElementById("t1").value,
            es_1: document.getElementById("es1").value,
            cf_1: document.getElementById("cf1").value,
            a_1: document.getElementById("a1").innerText,
            q_1: document.getElementById("qso1").value,
            va_1: document.getElementById("va1").innerText,
            vs_1: document.getElementById("vs1").value,
            vt_1: document.getElementById("vt1").value,
            so2_1: document.getElementById("so1").innerText,
            duration_2: document.getElementById("t2").value,
            es_2: document.getElementById("es2").value,
            cf_2: document.getElementById("cf2").value,
            a_2: document.getElementById("a2").innerText,
            q_2: document.getElementById("qso2").value,
            va_2: document.getElementById("va2").innerText,
            vs_2: document.getElementById("vs2").value,
            vt_2: document.getElementById("vt2").value,
            so2_2: document.getElementById("so2").innerText,
            duration_3: document.getElementById("t3").value,
            es_3: document.getElementById("es3").value,
            cf_3: document.getElementById("cf3").value,
            a_3: document.getElementById("a3").innerText,
            q_3: document.getElementById("qso3").value,
            va_3: document.getElementById("va3").innerText,
            vs_3: document.getElementById("vs3").value,
            vt_3: document.getElementById("vt3").value,
            so2_3: document.getElementById("so3").innerText,
            duration_4: document.getElementById("t4").value,
            es_4: document.getElementById("es4").value,
            cf_4: document.getElementById("cf4").value,
            a_4: document.getElementById("a4").innerText,
            q_4: document.getElementById("qso4").value,
            va_4: document.getElementById("va4").innerText,
            vs_4: document.getElementById("vs4").value,
            vt_4: document.getElementById("vt4").value,
            so2_4: document.getElementById("so4").innerText,
            duration_5: document.getElementById("t5").value,
            es_5: document.getElementById("es5").value,
            cf_5: document.getElementById("cf5").value,
            a_5: document.getElementById("a5").innerText,
            q_5: document.getElementById("qso5").value,
            va_5: document.getElementById("va5").innerText,
            vs_5: document.getElementById("vs5").value,
            vt_5: document.getElementById("vt5").value,
            so2_5: document.getElementById("so5").innerText,
            duration_6: document.getElementById("t6").value,
            es_6: document.getElementById("es6").value,
            cf_6: document.getElementById("cf6").value,
            a_6: document.getElementById("a6").innerText,
            q_6: document.getElementById("qso6").value,
            va_6: document.getElementById("va6").innerText,
            vs_6: document.getElementById("vs6").value,
            vt_6: document.getElementById("vt6").value,
            so2_6: document.getElementById("so6").innerText,
            avg_so2: document.getElementById("avgSO2").innerText
        },
        no2: {
            duration_1: document.getElementById("not1").value,
            as_1: document.getElementById("as1").value,
            cf_1: document.getElementById("ncf1").value,
            x_1: document.getElementById("x1").innerText,
            q_1: document.getElementById("nq1").value,
            va_1: document.getElementById("nva1").innerText,
            vs_1: document.getElementById("nvs1").value,
            vt_1: document.getElementById("nvt1").value,
            no2_1: document.getElementById("no1").innerText,
            duration_2: document.getElementById("not2").value,
            as_2: document.getElementById("as2").value,
            cf_2: document.getElementById("ncf2").value,
            x_2: document.getElementById("x2").innerText,
            q_2: document.getElementById("nq2").value,
            va_2: document.getElementById("nva2").innerText,
            vs_2: document.getElementById("nvs2").value,
            vt_2: document.getElementById("nvt2").value,
            no2_2: document.getElementById("no2").innerText,
            duration_3: document.getElementById("not3").value,
            as_3: document.getElementById("as3").value,
            cf_3: document.getElementById("ncf3").value,
            x_3: document.getElementById("x3").innerText,
            q_3: document.getElementById("nq3").value,
            va_3: document.getElementById("nva3").innerText,
            vs_3: document.getElementById("nvs3").value,
            vt_3: document.getElementById("nvt3").value,
            no2_3: document.getElementById("no3").innerText,
            duration_4: document.getElementById("not4").value,
            as_4: document.getElementById("as4").value,
            cf_4: document.getElementById("ncf4").value,
            x_4: document.getElementById("x4").innerText,
            q_4: document.getElementById("nq4").value,
            va_4: document.getElementById("nva4").innerText,
            vs_4: document.getElementById("nvs4").value,
            vt_4: document.getElementById("nvt4").value,
            no2_4: document.getElementById("no4").innerText,
            duration_5: document.getElementById("not5").value,
            as_5: document.getElementById("as5").value,
            cf_5: document.getElementById("ncf5").value,
            x_5: document.getElementById("x5").innerText,
            q_5: document.getElementById("nq5").value,
            va_5: document.getElementById("nva5").innerText,
            vs_5: document.getElementById("nvs5").value,
            vt_5: document.getElementById("nvt5").value,
            no2_5: document.getElementById("no5").innerText,
            duration_6: document.getElementById("not6").value,
            as_6: document.getElementById("as6").value,
            cf_6: document.getElementById("ncf6").value,
            x_6: document.getElementById("x6").innerText,
            q_6: document.getElementById("nq6").value,
            va_6: document.getElementById("nva6").innerText,
            vs_6: document.getElementById("nvs6").value,
            vt_6: document.getElementById("nvt6").value,
            no2_6: document.getElementById("no6").innerText,
            avg_no2: document.getElementById("avgNO2").innerText
        },
        pm25: {
            q1: document.getElementById("pm25_q1_1").value,
            q2: document.getElementById("pm25_q2_1").value,
            w1: document.getElementById("pm25_w1_1").value,
            w2: document.getElementById("pm25_w2_1").value
        }
    };
}

async function saveAgencyReport() {
    if (!validateCommonFields()) return;

    calculatePM10();
    calculateSO2();
    calculateNO2();
    calculatePM25();

    const payload = collectAgencyReportPayload();

    try {
        const res = await fetch("/save-agency-report", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const result = await res.json();

        if (!res.ok || result.error) {
            alert(result.error || "Error saving agency report");
            return;
        }

        alert(result.message || "Agency report saved successfully");
        window.location.href = result.redirectPage || "agency-dash.html";
    } catch (error) {
        console.log("Agency Report Save Error:", error);
        alert("Error saving agency report");
    }
}

function checkAllSectionsFilled() {
    const requiredInputs = document.querySelectorAll('.table-wrap input:not([type="hidden"]):not([readonly])');
    for (let inp of requiredInputs) {
        if (!inp.value || inp.value.trim() === '') {
            return false;
        }
    }
    return true;
}

function generateProfessionalPDF() {
    const printWindow = window.open('', '_blank');
    
    // Harvest necessary data for the report
    const industryDropdown = document.getElementById("industry_name");
    const industryName = industryDropdown.options[industryDropdown.selectedIndex].text || "Unknown Industry";
    const location = document.getElementById("location").value || "N/A";
    const monitoringDate = document.getElementById("date").value || "N/A";

    // Computed values
    const pm10Avg = document.getElementById("avgPM").innerText || "0.00";
    const so2Avg = document.getElementById("avgSO2").innerText || "0.00";
    const no2Avg = document.getElementById("avgNO2").innerText || "0.00";
    const pm25Val = document.getElementById("pm25_1").innerText || "0.00";

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
            .header { text-align: center; border-bottom: 2px solid #10b981; padding-bottom: 10px; margin-bottom: 30px; }
            .header h1 { margin: 0; color: #0f172a; font-size: 24px; }
            .header p { margin: 5px 0 0; color: #0f766e; font-size: 14px; }
            .section { margin-bottom: 20px; text-shadow: 0 0 1px rgba(255,255,255,0.8); }
            .section-title { font-size: 18px; color: #0f766e; border-bottom: 1px solid #cbd5e1; padding-bottom: 5px; margin-bottom: 15px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            table th, table td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #e2e8f0; }
            table th { background-color: #f8fafc; font-weight: 600; color: #334155; }
            .overview-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 30px; }
            .overview-item { padding: 15px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
            .overview-label { font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; margin-bottom: 5px; }
            .overview-value { font-size: 16px; font-weight: 700; color: #0f172a; }
            .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 20px; }
            .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 20px; background-color: rgba(255, 255, 255, 0.6); backdrop-filter: blur(5px); }
        </style>
    `;

    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>AQI Comprehensive Report - ${industryName}</title>
            ${cssStyles}
        </head>
        <body>
            <img src="${bgUrl}" class="bg-image" alt="background">
            <div style="position: relative; z-index: 1;">
                <div class="header" style="background-color: rgba(255, 255, 255, 0.6); backdrop-filter: blur(5px); display: inline-block; padding: 10px 30px; border-radius: 8px;">
                    <h1>Comprehensive AQI Monitoring Report</h1>
                    <p style="margin-top:0px">Generated by EnviroMonitor Agency Panel</p>
                </div>

                <div class="overview-grid">
                    <div class="overview-item">
                        <div class="overview-label">Industry Name</div>
                        <div class="overview-value">${industryName}</div>
                    </div>
                    <div class="overview-item">
                        <div class="overview-label">Location / Site</div>
                        <div class="overview-value">${location}</div>
                    </div>
                    <div class="overview-item">
                        <div class="overview-label">Monitoring Date</div>
                        <div class="overview-value">${monitoringDate}</div>
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
                                <td>${pm10Avg}</td>
                                <td>Recorded</td>
                            </tr>
                            <tr>
                                <td>Sulfur Dioxide (SO₂)</td>
                                <td>${so2Avg}</td>
                                <td>Recorded</td>
                            </tr>
                            <tr>
                                <td>Nitrogen Dioxide (NO₂)</td>
                                <td>${no2Avg}</td>
                                <td>Recorded</td>
                            </tr>
                            <tr>
                                <td>PM2.5</td>
                                <td>${pm25Val}</td>
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

async function generateReport() {
    if (!validateCommonFields()) return;

    if (!validateAllSamplingTimeRanges()) {
        alert("Please correct all invalid time ranges before generating the report.");
        return;
    }
    
    if (!checkAllSectionsFilled()) {
        alert("Fill full report: Ensure all input fields across PM10, SO2, NO2, and PM2.5 sections are completed.");
        return;
    }

    calculatePM10();
    calculateSO2();
    calculateNO2();
    calculatePM25();

    const payload = collectAgencyReportPayload();
    payload.status = 'Published';

    try {
        const res = await fetch("/save-agency-report", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const result = await res.json();

        if (!res.ok || result.error) {
            alert(result.error || "Error saving comprehensive report");
            return;
        }
        
        generateProfessionalPDF();
        alert("Full Report Generated & Saved to Dashboard Successfully!");
        window.location.href = "agency-dash.html";

    } catch (error) {
        console.error("Error saving reports:", error);
        alert("Server connection error while generating report.");
    }
}

async function saveAsDraft() {
    // Only basic common fields required for a draft
    if (!validateCommonFields()) return;

    // Run underlying math on whatever happens to be filled in right now
    calculatePM10();
    calculateSO2();
    calculateNO2();
    calculatePM25();

    const payload = collectAgencyReportPayload();
    payload.status = 'Pending'; // Mark as draft

    try {
        const res = await fetch("/save-agency-report", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const result = await res.json();

        if (!res.ok || result.error) {
            alert(result.error || "Error saving draft report");
            return;
        }
        
        alert("Draft Saved Successfully! Marked as pending.");
        window.location.href = "agency-dash.html";

    } catch (error) {
        console.error("Error saving draft:", error);
        alert("Server connection error while saving draft.");
    }
}

function logout() {
    localStorage.removeItem("userEmail");
    localStorage.removeItem("authToken");
    window.location.href = "index.html";
}

function updateStepStates(activeItem) {
    const navItems = Array.from(document.querySelectorAll(".nav-item"));
    const activeIndex = navItems.indexOf(activeItem);

    navItems.forEach((item, index) => {
        item.classList.remove("active", "completed", "upcoming");

        if (index < activeIndex) {
            item.classList.add("completed");
        } else if (index === activeIndex) {
            item.classList.add("active");
        } else {
            item.classList.add("upcoming");
        }
    });
}

function openSection(sectionId, clickedItem) {
    const targetSection = document.getElementById(sectionId);
    updateStepStates(clickedItem);

    if (targetSection) {
        targetSection.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const initialActive = document.querySelector(".nav-item.active") || document.querySelector(".nav-item");
    if (initialActive) {
        updateStepStates(initialActive);
    }

    setupIndustryLocationAutofill();
    setupSamplingTimeRangeControls();
    setupSixColumnLocationBinding();
    setupSixColumnTimeSync("so");
    setupSixColumnTimeSync("no");
    setupSixColumnTimeSync("pm25");
    enableTableArrowKeyNavigation();
});


    window.logout = logout;
    window.openSection = openSection;
    window.calculatePM10 = calculatePM10;
    window.calculateSO2 = calculateSO2;
    window.calculateNO2 = calculateNO2;
    window.calculatePM25 = calculatePM25;
    window.savePM10 = savePM10;
    window.saveSO2 = saveSO2;
    window.saveNO2 = saveNO2;
    window.savePM25 = savePM25;
    window.saveAgencyReport = saveAgencyReport;
    window.generateReport = generateReport;
    window.saveAsDraft = saveAsDraft;
})();
