const State = {
    selectedTab: "today",
    selectedDate: localIsoDate(),
    deals: [],
    foodDays: [],
    metadata: null,
    filters: { minimumScore: 0, eventType: "all" }
};

function localIsoDate(date = new Date()) {
    const timezoneOffset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    })[character]);
}

function displayDate(date) {
    if (!date) return "Unknown date";
    return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric"
    });
}

async function fetchJson(paths, required = true) {
    for (const path of paths) {
        try {
            const response = await fetch(path, { cache: "no-store" });
            if (response.ok) return response.json();
        } catch (error) {
            console.warn(`Unable to load ${path}`, error);
        }
    }
    if (required) throw new Error(`Unable to load ${paths[0]}`);
    return null;
}

async function initApp() {
    try {
        [State.deals, State.foodDays, State.metadata] = await Promise.all([
            fetchJson(["./data/deals.json"]),
            fetchJson(["./data/food_days.json"]),
            fetchJson(["./data/meta.json"], false)
        ]);
        if (!Array.isArray(State.deals) || !Array.isArray(State.foodDays)) {
            throw new Error("DailyBite data must be JSON arrays.");
        }
        setupNavigation();
        setupSettings();
        renderApp();
    } catch (error) {
        console.error(error);
        document.querySelector(".app-content").innerHTML = `
            <section class="system-message error-message">
                <h2>DailyBite data is unavailable</h2>
                <p>${escapeHtml(error.message)}</p>
                <p>Confirm the deployed site includes the <code>data</code> directory.</p>
            </section>`;
    }
}

function setupNavigation() {
    document.querySelectorAll(".nav-item").forEach(button => {
        button.addEventListener("click", event => {
            const target = event.currentTarget.dataset.target;
            if (!target) return;
            State.selectedTab = target;
            document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));
            event.currentTarget.classList.add("active");
            renderApp();
        });
    });
}

function setupSettings() {
    const button = document.querySelector("#settings-button");
    const panel = document.querySelector("#settings-panel");
    button.addEventListener("click", () => {
        const isOpen = panel.classList.toggle("hidden");
        button.setAttribute("aria-expanded", String(!isOpen));
    });
}

function renderApp() {
    document.querySelectorAll(".page-container").forEach(page => page.classList.add("hidden"));
    const active = document.getElementById(`view-${State.selectedTab}`);
    if (!active) return;
    active.classList.remove("hidden");

    if (State.selectedTab === "today") renderToday(active);
    if (State.selectedTab === "deals") renderDeals(active);
    if (State.selectedTab === "calendar") renderCalendar(active);
    updateAutomationStatus();
    if (window.feather) feather.replace();
}

function updateAutomationStatus() {
    const status = document.querySelector("#automation-status");
    const generatedAt = State.metadata?.generated_at;
    status.textContent = generatedAt ? `DATA UPDATED ${displayDate(generatedAt.slice(0, 10)).toUpperCase()}` : "LOCAL DATA";
}

function activeVerifiedDeals() {
    return State.deals.filter(deal => deal.verified === true && deal.event_end_date >= State.selectedDate);
}

function renderToday(container) {
    const todayDeals = activeVerifiedDeals()
        .filter(deal => deal.event_start_date <= State.selectedDate)
        .sort((a, b) => b.bite_score - a.bite_score);
    const bestDeal = todayDeals[0];

    container.innerHTML = `
        <div class="eyebrow">TODAY'S FOOD INTELLIGENCE</div>
        <h2 class="greeting-title">${escapeHtml(displayDate(State.selectedDate))}</h2>
        <p class="greeting-desc">Verified opportunities worth changing plans for.</p>
        ${bestDeal ? `<p class="section-label">BEST BITE</p>${createDealCard(bestDeal, true)}` : createEmptyState("No verified opportunities today", "The pipeline filters out uncertain or expired offers. Check All Opportunities to plan ahead.")}
        ${todayDeals.length > 1 ? `<p class="section-label">MORE BITES</p>${todayDeals.slice(1).map(deal => createDealCard(deal)).join("")}` : ""}`;
}

function renderDeals(container) {
    const types = [...new Set(activeVerifiedDeals().map(deal => deal.event_type).filter(Boolean))].sort();
    const deals = activeVerifiedDeals()
        .filter(deal => deal.bite_score >= State.filters.minimumScore)
        .filter(deal => State.filters.eventType === "all" || deal.event_type === State.filters.eventType)
        .sort((a, b) => b.bite_score - a.bite_score || a.event_end_date.localeCompare(b.event_end_date));

    container.innerHTML = `
        <div class="eyebrow">VERIFIED DIRECTORY</div>
        <h2 class="greeting-title">All Opportunities</h2>
        <p class="greeting-desc">Only live, verified offers appear here.</p>
        <div class="filters" aria-label="Deal filters">
            <label>Minimum score <select id="score-filter">
                ${[0, 70, 90, 100].map(score => `<option value="${score}" ${State.filters.minimumScore === score ? "selected" : ""}>${score === 0 ? "Any" : `${score}+`}</option>`).join("")}
            </select></label>
            <label>Type <select id="type-filter"><option value="all">All types</option>${types.map(type => `<option value="${escapeHtml(type)}" ${State.filters.eventType === type ? "selected" : ""}>${escapeHtml(type.replaceAll("_", " "))}</option>`).join("")}</select></label>
        </div>
        <p class="result-count">${deals.length} live verified ${deals.length === 1 ? "opportunity" : "opportunities"}</p>
        ${deals.length ? deals.map(deal => createDealCard(deal)).join("") : createEmptyState("No matching opportunities", "Try a lower score threshold or check back after the next scan.")}`;

    document.querySelector("#score-filter").addEventListener("change", event => {
        State.filters.minimumScore = Number(event.currentTarget.value);
        renderDeals(container);
    });
    document.querySelector("#type-filter").addEventListener("change", event => {
        State.filters.eventType = event.currentTarget.value;
        renderDeals(container);
    });
}

function renderCalendar(container) {
    const holidays = State.foodDays
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(day => {
            const linkedDeals = activeVerifiedDeals().filter(deal => deal.event_start_date <= day.date && deal.event_end_date >= day.date);
            return `<article class="holiday-row">
                <time datetime="${escapeHtml(day.date)}">${escapeHtml(displayDate(day.date))}</time>
                <strong>${escapeHtml(day.holiday)}</strong>
                ${linkedDeals.length ? `<span class="calendar-score">${Math.max(...linkedDeals.map(deal => deal.bite_score))} BITE</span>` : ""}
            </article>`;
        }).join("");
    container.innerHTML = `
        <div class="eyebrow">PLAN AHEAD</div>
        <h2 class="greeting-title">Food Calendar</h2>
        <p class="greeting-desc">Food holidays and their verified opportunities.</p>
        ${holidays || createEmptyState("No food holidays loaded", "Add date records to data/food_days.json.")}`;
}

function createEmptyState(title, description) {
    return `<section class="empty-state"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p></section>`;
}

function createDealCard(deal, featured = false) {
    const scoreClass = deal.bite_score >= 100 ? "score-100" : deal.bite_score >= 90 ? "score-90" : deal.bite_score >= 70 ? "score-70" : "score-low";
    const breakdown = deal.score_breakdown ? Object.entries(deal.score_breakdown)
        .map(([label, value]) => `<li><span>${escapeHtml(label.replaceAll("_", " "))}</span><strong>${escapeHtml(value)}</strong></li>`).join("") : "";
    return `<article class="deal-card ${featured ? "featured-deal" : ""}">
        <div class="deal-score ${scoreClass}" aria-label="BiteScore ${escapeHtml(deal.bite_score)}">${escapeHtml(deal.bite_score)}</div>
        <div class="deal-content">
            <div class="deal-kicker"><span>VERIFIED</span><span>${escapeHtml((deal.event_type || "deal").replaceAll("_", " "))}</span></div>
            <h3>${escapeHtml(deal.title)}</h3>
            <p>${escapeHtml(deal.description)}</p>
            <p class="deal-meta">${escapeHtml(deal.restaurant)} · ${escapeHtml(deal.location)} · Ends ${escapeHtml(displayDate(deal.event_end_date))}</p>
            ${breakdown ? `<details class="score-breakdown"><summary>Why this scored ${escapeHtml(deal.bite_score)}</summary><ul>${breakdown}</ul></details>` : ""}
            <a href="${escapeHtml(deal.source_url)}" target="_blank" rel="noopener noreferrer">View verification source <span aria-hidden="true">↗</span></a>
        </div>
    </article>`;
}

document.addEventListener("DOMContentLoaded", initApp);
