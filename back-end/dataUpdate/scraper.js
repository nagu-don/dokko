import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs/promises";
import cron from "node-cron";
import { translateData } from "./translateData.js";

const BASE_URL = "https://kalimatimarket.gov.np";

const DATA_FILE = "./dataUpdate/market-prices.json";
const STATE_FILE = "./dataUpdate/saved-date.json";

/**
 * Step 1
 * Get CSRF token and session cookies.
 */
async function getSession() {
    const response = await axios.get(`${BASE_URL}/price`,{timeout:15000});

    const $ = cheerio.load(response.data);

    const token = $('input[name="_token"]').val();

    if (!token) {
        throw new Error("Unable to find CSRF token.");
    }

    return {
        token,
        cookies: response.headers["set-cookie"] || []
    };
}

/**
 * Step 2
 * Submit the date form.
 */
async function fetchPricePage(date) {
    const { token, cookies } = await getSession();

    const form = new URLSearchParams();

    form.append("_token", token);
    form.append("datePricing", date);

    const response = await axios.post(
        `${BASE_URL}/price`,
        form.toString(),
        {
            timeout:15000,
            headers: {
                Cookie: cookies.join("; "),
                "Content-Type":
                    "application/x-www-form-urlencoded",
                Referer: `${BASE_URL}/price`,
                Origin: BASE_URL
            }
        }
    );

    return response.data;
}

/**
 * Step 3
 * Parse HTML table.
 */
function parsePrices(html) {
    const $ = cheerio.load(html);

    const prices = [];

    $("#commodityPriceParticular tbody tr").each((_, row) => {

        const cols = $(row).find("td");

        prices.push({
            commodity: $(cols[0]).text().trim(),
            unit: $(cols[1]).text().trim(),
            minPrice: $(cols[2]).text().trim(),
            maxPrice: $(cols[3]).text().trim(),
            avgPrice: $(cols[4]).text().trim()
        });

    });

    return prices;
}

/**
 * Main function
 */
async function getMarketPrices(date) {
    const html = await fetchPricePage(date);

    // Save the HTML so we can inspect it
    await fs.writeFile("response.html", html);

    console.log(html.substring(0, 500));

    return parsePrices(html);
}

function getNepalDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kathmandu",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function getLastSavedDate() {
  try {
    const data = await fs.readFile(STATE_FILE, "utf8");
    return JSON.parse(data).lastSavedDate;
  } catch {
    return null;
  }
}

async function savePrices(date, prices) {
  let data = [];

    try {
        const existing = await fs.readFile(DATA_FILE, "utf8");
        data = JSON.parse(existing);
    } catch (error) {
        if (error.code === "ENOENT") {
            console.log("Creating new data file...");
            data = [];
        } else {
            throw error;
        }
    }
    
    data=[{date,prices}]
  
  await fs.writeFile(
    DATA_FILE,
    JSON.stringify(data, null, 2)
  );


}

async function checkForNewPrices() {
  try {
    const today = getNepalDate();
    const lastSavedDate = await getLastSavedDate();

    // Already saved today's prices
    if (lastSavedDate === today) {
      console.log(`Already saved prices for ${today}`);
      return;
    }

    console.log(`Checking for prices for ${today}...`);

    const prices = await getMarketPrices(today);

    // No data yet
    if (!prices || prices.length === 0) {
      console.log("Today's prices are not available yet.");
      return;
    }

    // New data found
    console.log(
      `Found ${prices.length} prices for ${today}`
    );

    await savePrices(today, prices).then(()=>translateData());


    console.log(`Saved prices for ${today}`);
  } catch (error) {
    console.error("Price check failed:", error);
  }
}

const runScraper= async()=>{
    checkForNewPrices();
}

export {runScraper,getNepalDate, getLastSavedDate};