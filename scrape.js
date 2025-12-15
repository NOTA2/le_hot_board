import {createRequire} from "module";

const require = createRequire(import.meta.url);
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const _ = require('lodash');
import path from 'path';

const __dirname = path.resolve();

const ISSUE_COUNT = 20;

async function scraper(board, firstPage) {
    try {
        const dataResponse = await axios.get(encodeURI(`https://hiphople.com/${board}`));
        const $ = cheerio.load(dataResponse.data);

        console.log($.html())
        const hotIssueData = $('tr.notice > td.no > span.document-hot').parents('.notice')
        const ids = _.map(firstPage, issue => issue.id)

        for (let i = 0; i < hotIssueData.length; i++) {
            const href = $(hotIssueData[i]).find('.title > a:nth-child(1)').attr('href');
            const id = `${href.split('/')[1]}_${href.split('/')[2]}`;

            if (!_.includes(ids, id)) {
                firstPage.unshift({
                    id: id,
                    category: $(hotIssueData[i]).find('.category:nth-child(1)').text(),
                    title: $(hotIssueData[i]).find('.title > a:nth-child(1)').text(),
                    href: href,
                    author: $(hotIssueData[i]).find('.author > span > a:nth-child(1)').clone()    //clone the element
                        .children() //select all the children
                        .remove()   //remove all the children
                        .end()  //again go back to selected element
                        .text().trim(),
                    date: getDate($(hotIssueData[i]).find('.date').text()),
                    commentNum: $(hotIssueData[i]).find('.commentNum').text(),
                    isVideo: $(hotIssueData[i]).find('.fa-play-circle').length > 0,
                    isPhoto: $(hotIssueData[i]).find('.fa-image').length > 0
                })
            } else {
                // 값이 있으면 코멘트만 최신으로 변경
                firstPage = _.map(firstPage, issue => {
                    if (issue.id === id) {
                        issue.commentNum = $(hotIssueData[i]).find('.commentNum').text()
                    }
                    return issue
                })
            }
        }

        // 게시글 저장
        await fs.writeFileSync(path.join(`${__dirname}/${board}`, '1.json'), JSON.stringify(firstPage, null, 4));
        return firstPage;
    } catch (error) {
        console.error('An error occurred during scraping:', error);
    }
}

async function pageSort(board, firstPage) {
    if (firstPage.length <= ISSUE_COUNT) {
        return;
    }

    // 폴더 내의 모든 파일 목록을 배열로 저장
    let files = _.map(await fs.readdirSync(`${__dirname}/${board}`), file => _.replace(file, '.json', ''));
    files = _.filter(files, file => file !== 'meta');
    files = _.sortBy(files);
    let issues;
    let nextIssues;
    let nextPageIssues;

    for (let file of files) {
        issues = JSON.parse(await fs.readFileSync(`${__dirname}/${board}/${file}.json`, 'utf8'));

        if (issues.length > ISSUE_COUNT) {
            nextIssues = _.slice(issues, ISSUE_COUNT, issues.length)
            issues = _.slice(issues, 0, ISSUE_COUNT)

            await fs.writeFileSync(path.join(`${__dirname}/${board}`, `${parseInt(file)}.json`), JSON.stringify(issues, null, 4));

            // 다음파일 쓰기
            if (await fs.existsSync(`${__dirname}/${board}/${parseInt(file) + 1}.json`)) {
                // 있으면 앞에 추가
                nextPageIssues = JSON.parse(await fs.readFileSync(`${__dirname}/${board}/${parseInt(file) + 1}.json`, 'utf8'));
                nextIssues = nextIssues.concat(nextPageIssues);
            }

            await fs.writeFileSync(path.join(`${__dirname}/${board}`, `${parseInt(file) + 1}.json`), JSON.stringify(nextIssues, null, 4));
        }
    }
}

async function updateMetaData(board) {
    const meta = {
        totalPage: fs.readdirSync(`${__dirname}/${board}`).length - 1,
        lastUpdateTime: new Date()
    }

    await fs.writeFileSync(path.join(`${__dirname}/${board}`, `meta.json`), JSON.stringify(meta, null, 4));
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getDate(date) {
    if (!_.includes(date, '전')) {
        return date;
    }
    let currentDate = new Date();

    if (_.includes(date, '분')) {
        currentDate.setMinutes(currentDate.getMinutes() - parseInt(date.match(/\d+/g)));
    }

    if (_.includes(date, '시간')) {
        currentDate.setHours(currentDate.getHours() - parseInt(date.match(/\d+/g)));
    }

    return currentDate.getFullYear() + '.' + ('0' + (currentDate.getMonth() + 1)).slice(-2) + '.' + ('0' + currentDate.getDate()).slice(-2);
}

(async function () {
    const boards = ['kboard', 'fboard']
    for (let board of boards) {
        let firstPage = await JSON.parse(fs.readFileSync(`${__dirname}/${board}/1.json`, 'utf8'));
        firstPage = await scraper(board, firstPage);
        await pageSort(board, firstPage);
        await updateMetaData(board);
        await delay(2000); // 2초 대기
    }
}());
