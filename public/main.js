// main.js - client UI utilities
document.addEventListener("DOMContentLoaded", () => {
  // ========== DARK MODE ==========
  const body = document.body;
  const saved = localStorage.getItem("dms_dark");
  if (saved === "1") body.classList.add("dark");

  const darkToggle = document.getElementById("dark-toggle");
  if (darkToggle) {
    darkToggle.addEventListener("click", () => {
      body.classList.toggle("dark");
      localStorage.setItem(
        "dms_dark",
        body.classList.contains("dark") ? "1" : "0"
      );
    });
  }

  // ========== CLIENT TABLE SEARCH (optional extra) ==========
  const searchInput = document.getElementById("table-search");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const q = e.target.value.trim().toLowerCase();
      const rows = document.querySelectorAll("tbody tr");
      rows.forEach((r) => {
        const text = r.innerText.toLowerCase();
        r.style.display = text.includes(q) ? "" : "none";
      });
    });
  }

  // ========== FILTER TOLL INCLUDED ==========
  const tollFilter = document.getElementById("filter-toll");
  if (tollFilter) {
    tollFilter.addEventListener("change", () => {
      const val = tollFilter.value; // all / yes / no
      const rows = document.querySelectorAll("tbody tr");

      rows.forEach((r) => {
        const toll = r.dataset.includesToll === "1" ? "yes" : "no";
        if (val === "all") r.style.display = "";
        else r.style.display = val === toll ? "" : "none";
      });
    });
  }

  // =========================
  // DELETE CONFIRMATION MODAL
  // =========================
  const modal = document.getElementById("deleteModal");
  const cancelBtn = document.getElementById("cancelDelete");
  const confirmForm = document.getElementById("confirmDeleteForm");

  if (modal && confirmForm) {
    let entityId = null;
    let entityType = "trip";

    // Open modal
    document.querySelectorAll(".open-delete-modal").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        entityId = e.currentTarget.getAttribute("data-id");
        entityType = e.currentTarget.getAttribute("data-entity") || "trip";
        modal.style.display = "flex";
        document.body.classList.add("modal-open");
      });
    });

    // Close modal
    const closeModal = () => {
      modal.style.display = "none";
      document.body.classList.remove("modal-open");
      entityId = null;
    };

    if (cancelBtn) {
      cancelBtn.addEventListener("click", closeModal);
    }
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal.style.display === "flex") {
        closeModal();
      }
    });

    // Handle form submission
    confirmForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!entityId) return;

      const url =
        entityType === "driver"
          ? `/drivers/${entityId}/delete`
          : `/trips/${entityId}/delete`;
      
      const redirectUrl = entityType === 'driver' ? '/drivers' : '/trips';

      fetch(url, {
        method: "POST",
      })
      .then((res) => {
          if (res.ok) {
            window.location.href = redirectUrl;
          } else {
            alert("Delete failed!");
          }
        })
        .catch((err) => {
          console.error("Delete error:", err);
          alert("An error occurred during deletion.");
        })
        .finally(() => {
          closeModal();
        });
    });
  }
});

// =========================
// DRIVER AUTOCOMPLETE
// =========================
(function () {
  const driverInput = document.getElementById("driver-search");
  const suggestionsBox = document.getElementById("driver-suggestions");

  const carInput = document.getElementById("assigned_car");
  const phoneInput = document.getElementById("driver_phone");
  const carNoInput = document.getElementById("car_number");

  if (!driverInput || !suggestionsBox) return;

  let timeout = null;

  function clearSuggestions() {
    suggestionsBox.innerHTML = "";
    suggestionsBox.style.display = "none";
  }

  function unlockDriverInput() {
    driverInput.readOnly = false;
  }

  driverInput.addEventListener("input", (e) => {
    const q = e.target.value.trim();
    unlockDriverInput();

    if (timeout) clearTimeout(timeout);
    if (!q) return clearSuggestions();

    timeout = setTimeout(() => {
      fetch(`/api/drivers?search=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((rows) => {
          clearSuggestions();
          if (!rows.length) return;

          rows.forEach((d) => {
            const div = document.createElement("div");
            div.className = "suggestion-item";
            div.innerHTML = `
              <strong>${d.name}</strong><br>
              <span class="muted small">${d.car || ""} ${d.car_number || ""}</span>
            `;

            div.addEventListener("click", () => {
              driverInput.value = d.name;
              if (carInput) carInput.value = d.car || "";
              if (phoneInput) phoneInput.value = d.phone || "";
              if (carNoInput) carNoInput.value = d.car_number || "";

              driverInput.readOnly = true;
              clearSuggestions();
            });

            suggestionsBox.appendChild(div);
          });

          suggestionsBox.style.display = "block";
        })
        .catch(() => clearSuggestions());
    }, 150);
  });

  driverInput.addEventListener("dblclick", unlockDriverInput);

  document.addEventListener("click", (e) => {
    if (!driverInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
      clearSuggestions();
    }
  });
})();
