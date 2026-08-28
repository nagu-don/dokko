import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import itemModel from "../models/itemModel.js";

// --------------------------------------------------
// Get the directory of this file
// --------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --------------------------------------------------
// File paths
// --------------------------------------------------

// Assuming updateDatabase.js is inside the dataUpdate folder
const dataUpdateDir = __dirname;

const nepaliFile = path.join(
    dataUpdateDir,
    "market-prices.json"
);

const englishFile = path.join(
    dataUpdateDir,
    "market-prices-translated.json"
);

const lastUpdatedFile = path.join(
    dataUpdateDir,
    "saved-date.json"
);

// --------------------------------------------------
// Prevent simultaneous executions
// --------------------------------------------------

let isUpdating = false;

// --------------------------------------------------
// Read JSON
// --------------------------------------------------

function readJSON(filePath) {

    try {

        const data = fs.readFileSync(
            filePath,
            "utf-8"
        );

        return JSON.parse(data);

    } catch (error) {

        console.error(
            `Error reading ${filePath}:`,
            error.message
        );

        throw error;
    }
}

// --------------------------------------------------
// Get last processed date
// --------------------------------------------------

function getLastUpdatedDate() {

    if (!fs.existsSync(lastUpdatedFile)) {

        console.log(
            "saved-date.json does not exist."
        );

        return null;
    }

    try {

        const data = readJSON(
            lastUpdatedFile
        );

        console.log(
            `Last processed date: ${data.lastSavedDate}`
        );

        return data.lastSavedDate || null;

    } catch (error) {

        console.error(
            "Could not read last updated date:",
            error.message
        );

        return null;
    }
}


// --------------------------------------------------
// Initialize database
// --------------------------------------------------

async function initializeDatabase(
    nepaliPrices,
    englishPrices
) {

    console.log("Initializing database...");

    let createdCount = 0;
    let existingCount = 0;

    for (
        let i = 0;
        i < nepaliPrices.length;
        i++
    ) {

        const nepaliItem = nepaliPrices[i];
        const englishItem = englishPrices[i];

        if (!nepaliItem || !englishItem) {

            console.warn(
                `Missing item at index ${i}`
            );

            continue;
        }

        // ------------------------------------------
        // Check whether item already exists
        // ------------------------------------------

        const existingItem =
            await itemModel.findOne({
                nameNep: nepaliItem.commodity
            });

        if (existingItem) {

            existingCount++;

            continue;
        }

        // ------------------------------------------
        // Create item
        // ------------------------------------------

        await itemModel.create({

            nameEng: englishItem.commodity,
            nameNep: nepaliItem.commodity,

            unitEng: englishItem.unit,
            unitNep: nepaliItem.unit,

            minPrice: Number(
                englishItem.minPrice
            ),

            maxPrice: Number(
                englishItem.maxPrice
            ),

            avgPrice: Number(
                englishItem.avgPrice
            ),

            minPriceNep: nepaliItem.minPrice,
            maxPriceNep: nepaliItem.maxPrice,
            avgPriceNep: nepaliItem.avgPrice,

            // present in today's scrape
            available: true
        });

        createdCount++;

        console.log(
            `Created: ${nepaliItem.commodity}`
        );
    }

    console.log("--------------------------------");
    console.log(
        `Created: ${createdCount}`
    );
    console.log(
        `Already existed: ${existingCount}`
    );
    console.log("--------------------------------");
}

// --------------------------------------------------
// Update prices
// --------------------------------------------------

async function updatePrices(
    nepaliPrices,
    englishPrices
) {

    let updatedCount = 0;
    let createdCount = 0;

    for (
        let i = 0;
        i < nepaliPrices.length;
        i++
    ) {

        const nepaliItem = nepaliPrices[i];
        const englishItem = englishPrices[i];

        if (!nepaliItem || !englishItem) {

            console.warn(
                `Missing item at index ${i}`
            );

            continue;
        }

        // ------------------------------------------
        // Find item
        // ------------------------------------------

        const item =
            await itemModel.findOne({
                nameNep: nepaliItem.commodity
            });

        // ------------------------------------------
        // Item doesn't exist
        // ------------------------------------------

        if (!item) {

            console.log(
                `Item not found. Creating: ${nepaliItem.commodity}`
            );

            await itemModel.create({

                nameEng: englishItem.commodity,
                nameNep: nepaliItem.commodity,

                unitEng: englishItem.unit,
                unitNep: nepaliItem.unit,

                minPrice: Number(
                    englishItem.minPrice
                ),

                maxPrice: Number(
                    englishItem.maxPrice
                ),

                avgPrice: Number(
                    englishItem.avgPrice
                ),

                minPriceNep:
                    nepaliItem.minPrice,

                maxPriceNep:
                    nepaliItem.maxPrice,

                avgPriceNep:
                    nepaliItem.avgPrice,

                available: true
            });

            createdCount++;

            continue;
        }

        // ------------------------------------------
        // Update ONLY price fields
        // ------------------------------------------

        item.minPrice =
            Number(englishItem.minPrice);

        item.maxPrice =
            Number(englishItem.maxPrice);

        item.avgPrice =
            Number(englishItem.avgPrice);

        item.minPriceNep =
            nepaliItem.minPrice;

        item.maxPriceNep =
            nepaliItem.maxPrice;

        item.avgPriceNep =
            nepaliItem.avgPrice;

        // present in today's scrape
        item.available = true;

        // ------------------------------------------
        // Save
        // ------------------------------------------

        await item.save();

        updatedCount++;

        console.log(
            `Updated: ${nepaliItem.commodity}`
        );
    }

    console.log("--------------------------------");
    console.log(
        `Updated: ${updatedCount}`
    );
    console.log(
        `Created: ${createdCount}`
    );
    console.log("--------------------------------");
}

// --------------------------------------------------
// Sync availability against today's scraped data
//
// An item is "available" only if it appears in the
// scraped market data. Items missing from the scrape
// are marked unavailable AND unapproved (status false)
// so they disappear from the public site.
// --------------------------------------------------

async function syncAvailability(scrapedCommodities) {

    // items NOT in today's scrape → unavailable + hidden
    const markedUnavailable =
        await itemModel.updateMany(
            {
                nameNep: { $nin: scrapedCommodities },
                available: { $ne: false }
            },
            {
                $set:
                {
                    available: false,
                    status: false
                }
            }
        );

    // items back in the scrape after being away → available again
    // (status stays false — re-approval is a human decision)
    const markedAvailable =
        await itemModel.updateMany(
            {
                nameNep: { $in: scrapedCommodities },
                available: { $ne: true }
            },
            {
                $set: { available: true }
            }
        );

    console.log(
        `Availability synced: ${markedUnavailable.modifiedCount} now unavailable, ${markedAvailable.modifiedCount} available`
    );
}

function saveLastUpdatedDate(date) {
    fs.writeFileSync(
        lastUpdatedFile,
        JSON.stringify(
            { lastSavedDate: date },
            null,
            2
        )
    );

    console.log(`Saved last processed date: ${date}`);
}

// --------------------------------------------------
// Main update function
// --------------------------------------------------

export async function updateDatabase() {

    // ------------------------------------------------
    // Prevent simultaneous execution
    // ------------------------------------------------

    if (isUpdating) {

        console.log(
            "updateDatabase() is already running. Skipping this call."
        );

        return;
    }

    isUpdating = true;

    try {

        console.log(
            "--------------------------------"
        );

        console.log(
            "Checking market price database..."
        );

        // ------------------------------------------
        // Read files
        // ------------------------------------------

        const nepaliData =
            readJSON(nepaliFile);

        const englishData =
            readJSON(englishFile);

        // ------------------------------------------
        // Check files
        // ------------------------------------------

        if (
            !nepaliData.length ||
            !englishData.length
        ) {

            throw new Error(
                "One or both market price files are empty."
            );
        }

        // ------------------------------------------
        // Get dates
        // ------------------------------------------

        const nepaliDate =
            nepaliData[0].date;

        const englishDate =
            englishData[0].date;

        if (
            !nepaliDate ||
            !englishDate
        ) {

            throw new Error(
                "Date is missing from one of the market price files."
            );
        }

        // ------------------------------------------
        // Make sure dates match
        // ------------------------------------------

        if (
            nepaliDate !== englishDate
        ) {

            throw new Error(
                `Date mismatch:
Nepali file: ${nepaliDate}
English file: ${englishDate}`
            );
        }

        const currentDate =
            nepaliDate;

        // ------------------------------------------
        // Get price arrays
        // ------------------------------------------

        const nepaliPrices =
            nepaliData[0].prices;

        const englishPrices =
            englishData[0].prices;

        if (
            !nepaliPrices ||
            !englishPrices
        ) {

            throw new Error(
                "Prices array is missing."
            );
        }

        // ------------------------------------------
        // Check array lengths
        // ------------------------------------------

        if (
            nepaliPrices.length !==
            englishPrices.length
        ) {

            throw new Error(
                `Price count mismatch:
                Nepali: ${nepaliPrices.length}
                English: ${englishPrices.length}`
            );
        }

        // ------------------------------------------
        // Availability is synced on EVERY run because
        // it reflects the latest scrape, even when the
        // prices for this date were already processed.
        // ------------------------------------------

        await syncAvailability(
            nepaliPrices.map(
                (priceItem) => priceItem.commodity
            )
        );

        // ------------------------------------------
        // Get last processed date
        // ------------------------------------------

        const lastUpdatedDate =
            getLastUpdatedDate();

        console.log(
            `Current market date: ${currentDate}`
        );

        console.log(
            `Last processed date: ${lastUpdatedDate}`
        );

        // ------------------------------------------
        // IMPORTANT:
        // Check date BEFORE doing ANY database writes
        // ------------------------------------------

        if (
            currentDate === lastUpdatedDate
        ) {

            console.log(
                "Date has not changed."
            );

            console.log(
                "No database update required."
            );

            console.log(
                "--------------------------------"
            );

            return;
        }

        // ------------------------------------------
        // Check database
        // ------------------------------------------

        const databaseItemCount =
            await itemModel.countDocuments();

        console.log(
            `Items currently in database: ${databaseItemCount}`
        );

        // ------------------------------------------
        // INITIALIZE DATABASE
        // ------------------------------------------

        if (
            databaseItemCount === 0
        ) {

            console.log(
                "Database is empty."
            );

            await initializeDatabase(
                nepaliPrices,
                englishPrices
            );

            // // Only save date AFTER
            // // successful initialization
            saveLastUpdatedDate(
                currentDate
            );

            console.log(
                `Database initialized for ${currentDate}.`
            );

            console.log(
                "--------------------------------"
            );

            return;
        }

        // ------------------------------------------
        // UPDATE EXISTING DATABASE
        // ------------------------------------------

        if(lastUpdatedDate!==currentDate){

            console.log(
                `New market price date detected: ${currentDate}`
            );

            await updatePrices(
                nepaliPrices,
                englishPrices
            );

            // ------------------------------------------
            // Save date ONLY after successful update
            // ------------------------------------------

            saveLastUpdatedDate(
                currentDate
            );

            console.log(
                "Database update completed successfully."
            );

            console.log(
                `Processed date: ${currentDate}`
            );

            console.log(
                "--------------------------------"
            );

        }

    } catch (error) {

        console.error(
            "Database update failed:",
            error
        );

        throw error;

    } finally {

        // ------------------------------------------
        // Always release the lock
        // ------------------------------------------

        isUpdating = false;
    }
}