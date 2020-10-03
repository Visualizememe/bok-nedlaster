const got = require("got");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const OCRSpaceAPI = require("ocr-space-api");
const path = require("path");
const FormData = require("form-data");
const request = require("request");

const OCROptions = {
    apikey: "20e3a4c87888957",
    language: "eng",
    isOverlayRequired: true
};

const COOKIES = "__stripe_mid=dd9df2cc-7be0-4550-8014-442839eb0bba; _ga=GA1.2.1905093056.1600534986; _gid=GA1.2.705723068.1600964224; __stripe_sid=a7111f8a-3e88-4620-92b9-6be6f3309073; BBWebshopCartID=a09cb3e783a373c1dd4657e160a6cb42; BBSessionID=2fed657762557c36d079e948e5d8fbd4; _gat=1";
const BOOK_ID = 1391;
const IMAGE_X = 1712;
const IMAGE_Y = 2348;
const PDF_X = 612;
const PDF_Y = 792;

const ocr_pdf_file = async (pdfFile) => {
    const options = {
        'method': 'POST',
        'url': 'https://api.ocr.space/parse/image',
        'headers': {
            'Content-Type': 'multipart/form-data',
            'accept': 'application/json, text/javascript, */*; q=0.01',
            'accept-encoding': 'gzip, deflate, br',
            'accept-language': 'en-US, en;q=0.9,no;q=0.8',
            'apikey': '20e3a4c87888957',
            'origin': 'https://ocr.space',
            'referer': 'https://ocr.space/',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-site',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.121 Safari/537.36'
        },
        formData: {
            'file': {
                'value': fs.createReadStream(pdfFile),
                'options': {
                    'filename': pdfFile,
                    'contentType': "application/pdf"
                }
            },
            'url': '',
            'language': 'eng',
            'isOverlayRequired': 'true',
            'FileType': 'pdf',
            'IsCreateSearchablePDF': 'true',
            'isSearchablePdfHideTextLayer': 'true',
            'detectOrientation': 'false',
            'isTable': 'false',
            'scale': 'true',
            'OCREngine': '2',
            'detectCheckbox': 'false',
            'checkboxTemplate': '0'
        }
    };

    const result = await new Promise((resolve, reject) => {
        request(options, (err, res) => {
            if (err) {
                return reject(err);
            } else {
                return resolve(res.body);
            }
        })
    });

    console.log(result);

    return {
        result,
        downloadUrl: result.SearchablePDFURl
    };
};
const wait = (t) => new Promise(resolve => setTimeout(resolve, t * 1000));
const get_book_images = async (bookId) => {
    const response = await got({
        url: `https://portal.brettboka.no/spa-api/publications/${bookId}`,
        headers: {
            Cookie: COOKIES
        }
    }).json();

    const book = response.publication;
    const pages = book.pages;

    let start_from_index = 0;

    (() => {
        const amountImages = fs.readdirSync(`./downloads/${BOOK_ID}/images`);
        start_from_index = amountImages.length || 0;
    })();

    console.log(`Starting from page ${start_from_index}`);

    return {
        data: response,
        totalPages: pages.length,
        execute: async () => {
            for (let i = start_from_index; i < pages.length; i++) {
                const pageData = pages[i];
                const pageUrl = pageData.prends[pageData.prends.length - 1].url;
                const imageData = await got.stream({
                    url: pageUrl
                });
                const fileStream = fs.createWriteStream(`./downloads/${bookId}/images/${i + 1}.jpg`);

                console.log(`Downloading image from page ${i + 1} to: ./downloads/${bookId}/images/${i + 1}.jpg`);
                imageData.pipe(fileStream);

                await wait(0.25);
            }
        }
    };
};
const get_book_texts = async (bookId, totalPages) => {
    const retrieved_texts = [];

    if (fs.existsSync(`./downloads/${bookId}/meta/texts.json`)) {
        return JSON.parse(fs.readFileSync(`./downloads/${bookId}/meta/texts.json`, "utf8"));
    }

    const retrieve = async (start, end) => got(`https://portal.brettboka.no/spa-api/publications/${bookId}/w?f=${start}&t=${end}`, {
        headers: {
            Cookie: COOKIES
        }
    })
        .json()
        .then(body => body.w);

    let amount_iterations = Math.ceil(totalPages / 100);

    for (let current_iter = 0; current_iter < amount_iterations; current_iter++) {
        let index_positions = [current_iter + 1, (current_iter + 1) * 100];
        console.log(index_positions);
        let data = await retrieve(...index_positions);
        let keys = Object.keys(data).sort();

        for (let key_index = 0; key_index < keys.length; key_index++) {
            let page_data = data[keys[key_index]];


            retrieved_texts.push(page_data);
        }
    }

    return retrieved_texts;
}

(async () => {
    console.log(`Starting download of book with id ${BOOK_ID}`);
    /*const doc = new PDFDocument({
        autoFirstPage: false
    });
    doc.pipe(
        fs.createWriteStream("./out-test/test.pdf")
    );*/

    try {
        fs.mkdirSync(`./downloads/${BOOK_ID}`);
    } catch (e) {
        console.log(`Dir for book ${BOOK_ID} already exists!`)
    }

    try {
        fs.mkdirSync(`./downloads/${BOOK_ID}/images`);
    } catch (e) {
        console.log(`Images directory for ${BOOK_ID} already exists!`)
    }

    try {
        fs.mkdirSync(`./downloads/${BOOK_ID}/meta`);
    } catch (e) {
        console.log(`Meta directory for ${BOOK_ID} already exists!`)
    }

    try {
        fs.mkdirSync(`./downloads/${BOOK_ID}/pdfs`);
    } catch (e) {
        console.log(`PDFs directory for ${BOOK_ID} already exists!`)
    }

    const prepareBookImagesDownload = await get_book_images(BOOK_ID);
    console.log(`Book has ${prepareBookImagesDownload.totalPages} total pages!`);


    console.log("Saving meta data about book to meta/data.json");
    try {
        fs.writeFileSync(
            `./downloads/${BOOK_ID}/meta/data.json`,
            JSON.stringify(prepareBookImagesDownload.data),
            "utf8"
        );
    } catch (e) {
        console.log("Failed to save meta information about book!");
    }


    console.log(`Performing downloads..`);
    const [
        bookImagesFinished,
        bookPagesTexts
    ] = await Promise.all([
        prepareBookImagesDownload.execute(),
        get_book_texts(BOOK_ID, prepareBookImagesDownload.totalPages)
    ]);

    console.log("Downloads finished, saving book pages texts to meta/texts.json");

    try {
        fs.writeFileSync(
            `./downloads/${BOOK_ID}/meta/texts.json`,
            JSON.stringify(bookPagesTexts),
            "utf8"
        );
    } catch (e) {
        console.log(`Failed to save book's page texts!`);
    }

    const total_pages = 3; //prepareBookImagesDownload.totalPages;

    for (let page_index = 0; page_index < total_pages; page_index++) {
        console.log(`Creating page ${page_index}`);
        const pageData = {
            image: `./downloads/${BOOK_ID}/images/${page_index + 1}.jpg`,
            texts: bookPagesTexts[page_index]
        };
        const scale = 0.36;

        // Creating the PDF document object
        const document = new PDFDocument({
            autoFirstPage: false
        });

        // Creating a file stream where the PDF document will be saved at
        const pdfSavePath = path.join(__dirname, `./downloads/${BOOK_ID}/pdfs/${page_index + 1}.pdf`);
        const documentFileStream = fs.createWriteStream(pdfSavePath);

        // Piping to file stream
        document.pipe(
            documentFileStream
        )

        // Creating a new page for the PDF document
        document.addPage({
            margin: 0
        });

        // Adding the image
        document.image(pageData.image, {
            scale
        });

        document.end();

        console.log(`Created temporary PDF for page ${page_index + 1}!`);

        let pdf_data = await ocr_pdf_file(pdfSavePath);
        console.log(pdf_data);
    }
})();
