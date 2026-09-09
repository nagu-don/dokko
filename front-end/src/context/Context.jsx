import { createContext, useState, useEffect, useRef } from "react";
import axios from "axios";
import { translations } from "../i18n/translations";
import { toNe } from "../utils/nepaliNumbers";

export const Context = createContext(null);

// default stepper increment for weight-based (kg) items
export const STEP = 0.1;

// coarse increment used by double-click and press-and-hold (1 kg / 1 unit)
export const BULK_STEP = 1;

// weight-based items ("kg", default) step in 0.1/1 kg; count-based items
// (dozen, per piece, L, ...) step in whole units
export const isKgUnit = (item) => {
  const u = String(item?.unitEng || item?.unitNep || "kg").trim().toLowerCase();
  return (
    u === "" || u === "kg" || u === "kilogram" || u === "kilo" ||
    u === "किलो" || u === "के.जी." || u === "केजी"
  );
};

export const qtySteps = (item) =>
  isKgUnit(item) ? { fine: STEP, bulk: BULK_STEP } : { fine: 1, bulk: 1 };

// avoids float drift: 0.1 + 0.2 -> 0.3, not 0.30000000000000004
const round1 = (n) => Math.round(n * 10) / 10;

const ContextProvider = (props) => {
    const url = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

    const [items, setItems] = useState([]);

    // cart shape: { "itemId": quantity, ... } — quantity is in the item's own unit
    // loaded from localStorage so the cart survives page refresh
    const [cartItems, setCartItems] = useState(() => {
        try {
            const saved = localStorage.getItem("cartItems");
            return saved ? JSON.parse(saved) : {};
        } catch {
            return {};
        }
    });

    // keep localStorage in sync with the cart
    useEffect(() => {
        localStorage.setItem("cartItems", JSON.stringify(cartItems));
    }, [cartItems]);

    // adds the item's fine step by default (0.1 kg / 1 unit) — also puts the
    // item in the cart if it wasn't there
    const addToCart = (itemId, amount) => {
        const step = amount ?? qtySteps(items.find((i) => i._id === itemId)).fine;
        setCartItems((prev) => ({
            ...prev,
            [itemId]: round1((prev[itemId] || 0) + step),
        }));
    };

    // "-0.1 kg / -1 unit" by default — when it reaches 0 the item leaves the cart
    const decreaseQuantity = (itemId, amount) => {
        const step = amount ?? qtySteps(items.find((i) => i._id === itemId)).fine;
        setCartItems((prev) => {
            if (!prev[itemId]) return prev;
            const newQty = round1(prev[itemId] - step);
            if (newQty <= 0) {
                const updated = { ...prev };
                delete updated[itemId];
                return updated;
            }
            return { ...prev, [itemId]: newQty };
        });
    };

    // used by the typed input — accepts a string or a number
    const setQuantity = (itemId, value) => {
        const item = items.find((i) => i._id === itemId);
        let num = round1(Number(value));
        if (!isKgUnit(item)) num = Math.round(num); // count units are whole numbers
        setCartItems((prev) => {
            // empty / invalid / zero removes the item from the cart
            if (!Number.isFinite(num) || num <= 0) {
                const updated = { ...prev };
                delete updated[itemId];
                return updated;
            }
            return { ...prev, [itemId]: Math.min(num, 999) }; // sane upper bound
        });
    };

    // "Remove item" — deletes it from the cart completely, no matter the quantity
    const removeItemCompletely = (itemId) => {
        setCartItems((prev) => {
            const updated = { ...prev };
            delete updated[itemId];
            return updated;
        });
    };

    // empties the whole cart (used after a successful checkout)
    const clearCart = () => setCartItems({});

    // total quantity across the whole cart (only meaningful for all-kg carts)
    const getCartTotalQuantity = () => {
        return round1(Object.values(cartItems).reduce((sum, qty) => sum + qty, 0));
    };

    // true when every line is a weight-based item
    const isCartAllKg = () =>
        Object.keys(cartItems).every((id) => isKgUnit(items.find((i) => i._id === id)));

    // cart badge: total kg for all-kg carts, otherwise the line count
    const getCartBadge = () => {
        const ids = Object.keys(cartItems);
        if (ids.length === 0) return 0;
        return isCartAllKg()
            ? round1(ids.reduce((sum, id) => sum + (cartItems[id] || 0), 0))
            : ids.length;
    };

    const getList = async () => {
        try {
            const response = await axios.get(url + "/api/items/list-approved");
            setItems(response.data.data);
        } catch (error) {
            console.error("Error fetching items:", error);
        }
    };

        //Search
    const [searchQuery, setSearchQuery] = useState("");

    // the query that has actually been SUBMITTED (Enter / search button / suggestion click)
    // Explore filters on this one, not on every keystroke
    const [activeSearch, setActiveSearch] = useState("");

    // auth token — kept in localStorage so login survives a refresh
    const [token, setToken] = useState(() => localStorage.getItem("authToken") || "");

    const setAuthToken = (value) => {
        if (value) localStorage.setItem("authToken", value);
        else localStorage.removeItem("authToken");
        setToken(value);
    };

    // controls whether the login / sign-up popup is visible
    const [showAuth, setShowAuth] = useState(false);

    // small floating message (e.g. "Logged in successfully")
    const [toastMsg, setToastMsg] = useState("");
    const toastTimer = useRef(null);

    const showToast = (msg) => {
        setToastMsg(msg);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToastMsg(""), 3000);
    };

    useEffect(() => () => clearTimeout(toastTimer.current), []);

    //Search
    const submitSearch = (query) => {
        const q = (query ?? "").trim();
        setSearchQuery(q);
        setActiveSearch(q);
    };

    const clearSearch = () => {
        setSearchQuery("");
        setActiveSearch("");
    };

    // ---- language + theme (settings menu) ----
    const [lang, setLang] = useState(() => localStorage.getItem("dokkoLang") || "en");
    const [theme, setTheme] = useState(() => localStorage.getItem("dokkoTheme") || "light");

    useEffect(() => {
        localStorage.setItem("dokkoLang", lang);
        document.documentElement.lang = lang === "np" ? "ne" : "en";
    }, [lang]);

    useEffect(() => {
        localStorage.setItem("dokkoTheme", theme);
        document.documentElement.dataset.theme = theme;
    }, [theme]);

    // translate a key using the active language, falling back to English.
    // in Nepali every number inside the result becomes Devanagari too
    const t = (key, vars) => {
        let str = translations[lang]?.[key] ?? translations.en[key] ?? key;
        if (vars) {
            for (const [name, value] of Object.entries(vars)) {
                str = str.replaceAll(`{${name}}`, value);
            }
        }
        return lang === "np" ? toNe(str) : str;
    };

    // currency follows the language: Rs. / रु. — digits localized in Nepali
    const money = (n) => {
        const rounded = Math.round(Number(n || 0) * 100) / 100;
        const text = `${lang === "np" ? "रु." : "Rs."} ${rounded}`;
        return lang === "np" ? toNe(text) : text;
    };

    // localize standalone numbers ("0.5" -> "०.५")
    const num = (n) => (lang === "np" ? toNe(n) : String(n));

    // item names follow the language, falling back to English when missing
    const iname = (item) =>
        lang === "np" && item?.nameNep ? item.nameNep : item?.nameEng;

    // item units follow the language, falling back to the other language,
    // then to the generic unit label when the view has no unit (order rows)
    const iunit = (item) => {
        const unit = lang === "np" ? item?.unitNep || item?.unitEng : item?.unitEng || item?.unitNep;
        return unit || t("unitKg");
    };

    useEffect(() => {
        getList();
    }, []);

    const contextValue = {
        items,
        url,
        cartItems,
        addToCart,
        decreaseQuantity,
        setQuantity,
        removeItemCompletely,
        clearCart,
        isKgUnit,
        qtySteps,
        isCartAllKg,
        getCartTotalQuantity,
        getCartBadge,
        searchQuery,
        setSearchQuery,
        activeSearch,
        submitSearch,
        clearSearch,
        token,
        setAuthToken,
        showAuth,
        setShowAuth,
        toastMsg,
        showToast,
        lang,
        setLang,
        theme,
        setTheme,
        t,
        money,
        num,
        iname,
        iunit,
    };

    return (
        <Context.Provider value={contextValue}>
            {props.children}
        </Context.Provider>
    );
};

export default ContextProvider;