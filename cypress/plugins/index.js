require('@babel/register')({presets: [['@babel/preset-env', {targets: {node: 'current',},},]],})  //So that import statements will also be supported. The plugins file runs within the context of Node - and also within the Node.js version bundled with Cypress
require('dotenv').config();


const fs = require('fs')
const fsExtra = require('fs-extra')
const XLSX = require('xlsx')
const fileUtils = require("../../common/sharedutils/file-util")
const cucumber = require('cypress-cucumber-preprocessor').default

/**
 * Checks if specified file exists in file system
 *
 * @param {string} file
 * @returns {boolean}
 */
const findFile = (file) => {
    console.log("Checking if file exists: " + file + " ..")
    const contents = fs.existsSync(file);
    console.log("File found: " + contents)
    return contents;
};

/**
 * Periodically checks if specified file exists in file system using findFile() function
 *
 * @param {string} file - File name
 * @param {number} ms - The period
 * @returns {Promise}
 */
const hasFile = (file, ms) => {
    const delay = 10;
    return new Promise((resolve, reject) => {
        if (ms < 0) {
            return reject(
                new Error(`Could not find file ` + file)
            );
        }
        const found = findFile(file);
        if (found) {
            return resolve(true);
        }
        setTimeout(() => {
            hasFile(file, ms - delay).then(resolve, reject);
        }, 10);
        console.log("File '" + file + "' is not downloaded yet. Checking again..")
    });
};


/**
 * @type {Cypress.PluginConfig}
 */
module.exports = async (on, config) => {

    //cypress-cucumber-preprocessor
    on('file:preprocessor', cucumber());

    //Cypress html reporter
    require('cypress-mochawesome-reporter/plugin')(on);


    const pickTestsFromPullRequest = require('grep-tests-from-pull-requests')

    let testsFromPrOpts = {
        tags: ['@testtag', '@smoke', '@other'],
        owner: 'CSMI',
        repo: 'CSMIAutomation',
        pull: "" || process.env.GITHUB_PR_NUMBER,
        commit: "" || process.env.GITHUB_PR_SHA,
        token: process.env.GITH_TOKEN
    }

    let testsToRun
    let testTags = ""

    if (process.env.GITHUB_PR_SHA) {
        /**
         * Pick the test tags marked in PR template according to pull request number/head commit SHA
         *
         */
        testsToRun = await pickTestsFromPullRequest(on, config, testsFromPrOpts)
        console.log('SHA of the latest commit on Github that belongs to the PR that triggers this workflow: ', process.env.GITHUB_PR_SHA)
        console.log("Picked tests to run from " + testsFromPrOpts.repo + "app repo", testsToRun)
        console.log('Test tags: ', testsToRun.tags)

        /**
         * Prepare the tags for cucumber tag-expressions(e.g ("@a or @b"), ("not @a or @b"))
         * Below is for or operation so that multiple tests can be chosen
         */
        for (const item of testsToRun.tags) {
            if (item.startsWith("@") && testTags === "") {
                testTags = item
            } else if (item.startsWith("@")) {
                testTags = testTags.concat(" or ", item)
            }
        }
        console.log('Test tags as Cucumber tag-expressions: ', testTags)
    }


    /**
     * Modify the viewport window size for high resolution video recordings of test runs
     * @see https://github.com/cypress-io/cypress-example-recipes/tree/master/examples/fundamentals__window-size
     *
     * @param {String} browser
     * @param {String} launchOptions  - Browser launch options
     */
    on('before:browser:launch', (browser = {}, launchOptions) => {
        console.log('launching browser %s is headless? %s', browser.name, browser.isHeadless)

        // the browser width and height we want to get
        // our screenshots and videos will be of that resolution
        const width = 1680
        const height = 1050

        console.log('setting the browser window size to %d x %d', width, height)

        if (browser.name === 'chrome' && browser.isHeadless) {
            launchOptions.args.push(`--window-size=${width},${height}`)
            launchOptions.args.push('--force-device-scale-factor=1')
        }

        if (browser.name === 'electron' && browser.isHeadless) {
            launchOptions.preferences.width = width
            launchOptions.preferences.height = height
        }

        if (browser.name === 'firefox' && browser.isHeadless) {
            launchOptions.args.push(`--width=${width}`)
            launchOptions.args.push(`--height=${height}`)
        }

        return launchOptions
    });


    /**
     * Test context store
     *
     */
    const items = {}
    on('task', {
        /**
         * Store objects and primitives in test context
         *
         * @param {String} name
         * @param {object} value  - Value to set
         */
        setItem({name, value}) {
            console.log('setting %s', name)
            if (typeof value === 'undefined') {
                throw new Error(`Cannot store undefined value for item "${name}"`)
            }

            const msg = `Item stored in context: "${name}"`
            console.error(msg)

            items[name] = value

            return null
        },

        /**
         * Get from test context
         *
         * @param {String} name
         */
        getItem(name) {
            if (name in items) {
                console.log('returning item %s', name)

                return items[name]
            }

            const msg = `Missing item "${name}"`

            console.error(msg)
            throw new Error(msg)
        }
    });



    on('task', {
        excelToJson(filePath) {
            let workbook = XLSX.readFile(filePath);
            return fileUtils.excelToJson(workbook)
        }
    });


    on('task', {
        consoleLog(message) {
            console.log(message)
            return null
        }
    });


    on('task', {
        checkIfFileIsDownloaded(file, ms = 4000) {
            console.log("Checking if the file is downloaded: " + file)
            return hasFile(file, ms);
        }
    });

    if (process.env.GITHUB_PR_SHA) {    //Then it means framework was invoked by CI
        config.env.TAGS = testTags
    }

    return config
}

