import fs from "fs";

const inputFile = "./dataUpdate/market-prices.json";
const outputFile = "./dataUpdate/market-prices-translated.json";
const translationFile = "./dataUpdate/commodityTranslations.json";

const commodityTranslations = JSON.parse(
    fs.readFileSync(
        translationFile,
        "utf8"
    )
)[0].commodityTranslations;

// --------------------------------------------------
// Nepali digit -> English digit
// --------------------------------------------------

function nepaliToEnglishDigits(value) {

    const digits = {
        "०": "0",
        "१": "1",
        "२": "2",
        "३": "3",
        "४": "4",
        "५": "5",
        "६": "6",
        "७": "7",
        "८": "8",
        "९": "9"
    };

    return value.replace(
        /[०-९]/g,
        digit => digits[digit]
    );
}

// --------------------------------------------------
// Convert "रू ५०.००" -> 50
// --------------------------------------------------

function parsePrice(value) {

    if (value === null || value === undefined) {
        return null;
    }

    // If it is already a number
    if (typeof value === "number") {
        return value;
    }

    const englishNumber =
        nepaliToEnglishDigits(String(value))
            .replace("रू", "")
            .replace(/,/g, "")
            .trim();

    const number = Number(englishNumber);

    if (Number.isNaN(number)) {
        console.warn(`Could not parse price: ${value}`);
        return null;
    }

    return number;
}

// --------------------------------------------------
// Unit translations
// --------------------------------------------------

const unitTranslations = {

    "के.जी.": "kg",
    "केजी": "kg",
    "के जी": "kg",
    "के.जी": "kg",

    "दर्जन": "dozen",

    "प्रति गोटा": "per piece"
};

// --------------------------------------------------
// Translate one price item
// --------------------------------------------------

function translateItem(item) {

    return {

        commodity:
            commodityTranslations[item.commodity] ??
            item.commodity,

        unit:
            unitTranslations[item.unit] ??
            item.unit,

        minPrice:
            parsePrice(item.minPrice),

        maxPrice:
            parsePrice(item.maxPrice),

        avgPrice:
            parsePrice(item.avgPrice)

    };
}

// --------------------------------------------------
// Add / update commodity translation
// --------------------------------------------------

export function addCommodityTranslation(nameNep, nameEng) {

    try {

        if (!nameNep || !nameEng) {
            console.warn(
                "Cannot save commodity translation: missing nameNep or nameEng"
            );

            return false;
        }

        const rawData = fs.readFileSync(
            translationFile,
            "utf8"
        );

        const data = JSON.parse(rawData);

        if (
            !Array.isArray(data) ||
            !data[0] ||
            !data[0].commodityTranslations
        ) {
            throw new Error(
                "Invalid commodityTranslations.json structure."
            );
        }

        data[0].commodityTranslations[nameNep] = nameEng;

        fs.writeFileSync(
            translationFile,
            JSON.stringify(data, null, 2),
            "utf8"
        );

        console.log(
            `Added commodity translation: ${nameNep} -> ${nameEng}`
        );

        return true;

    } catch (error) {

        console.error(
            "Error adding commodity translation:",
            error
        );

        return false;
    }
}

// --------------------------------------------------
// Main
// --------------------------------------------------

export function translateData() {

    try {

        // Read market-prices.json
        const rawData = fs.readFileSync(
            inputFile,
            "utf8"
        );

        const data = JSON.parse(rawData);

        // ------------------------------------------
        // data is:
        //
        // [
        //     {
        //         date: "...",
        //         prices: [...]
        //     }
        // ]
        // ------------------------------------------

        if (!Array.isArray(data)) {

            throw new Error(
                "market-prices.json must contain an array."
            );

        }

        // ------------------------------------------
        // Translate each DATE
        // ------------------------------------------

        const translatedData = data.map(day => {

            return {

                date: day.date,

                prices: day.prices.map(
                    translateItem
                )

            };

        });

        // ------------------------------------------
        // Save translated data
        // ------------------------------------------

        fs.writeFileSync(

            outputFile,

            JSON.stringify(
                translatedData,
                null,
                2
            ),

            "utf8"

        );

        console.log(
            `Successfully translated ${data.length} date(s).`
        );

        console.log(
            `Saved to ${outputFile}`
        );

    }

    catch (error) {

        console.error(
            "Error translating market prices:"
        );

        console.error(error);

    }
}