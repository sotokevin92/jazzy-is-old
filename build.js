import path from 'path';
import { readdir, readFile, writeFile } from 'fs/promises';

const TEMPLATE_EXTENSION = '.template.html';

const srcDir = './src';
const outputDir = './public';

const pageFiles = (await readdir(
    path.join(srcDir, 'pages'), {
        recursive: true
    }
)).filter(x => x.endsWith(TEMPLATE_EXTENSION));

let baseLayout;

async function getBaseLayout() {
    if (!baseLayout) {
        baseLayout = await readFile(path.join(srcDir, `base${TEMPLATE_EXTENSION}`), 'utf-8');
    }

    return baseLayout;
}

for (const file of pageFiles) {
    console.log(`Processing ${file}...`);

    const content = await readFile(path.join(srcDir, 'pages', file), 'utf-8');
    const lines = content.split('\n');

    // If we're extending from the base layout, use it for the rest of the process
    const templateOutput = lines[0] === '@base' ?
        (await getBaseLayout()).split('\n') :
        lines
    ;

    // *** process @yield, find indexes and reverse sort so we can splice later ***
    const yields = [];
    templateOutput.forEach(
        (x, index) => {
            if (!x.trim().startsWith('@yield')) {
                return;
            }

            yields.push({
                index,
                name: x.trim().slice(7),
            });
        }
    );

    yields.sort((a, b) => b.index - a.index);

    // Find sections in target page and replace with content from @section matching the @yield tag
    for (const yieldLine of yields) {
        const yieldContentStartIdx = lines.findIndex(x => x === `@section ${yieldLine.name}`);
        const yieldContentEndIdx = lines.findIndex((x, idx) => x === `@end` && idx > yieldContentStartIdx);

        templateOutput.splice(
            yieldLine.index, 1, ...lines.slice(yieldContentStartIdx + 1, yieldContentEndIdx)
        );
    }

    // *** process @include, find indexes and reverse sort so we can splice later ***
    const includeDirectives = [];
    templateOutput.forEach(
        (x, index) => {
            if (!x.trim().startsWith('@include')) {
                return;
            }

            includeDirectives.push({
                index,
                name: x.trim().slice(9),
            });
        }
    );

    includeDirectives.sort((a, b) => b.index - a.index)

    // Splice them lines!
    for (const includeDirective of includeDirectives) {
        const includeContent = (await readFile(path.join(srcDir, `${includeDirective.name}`), 'utf-8'))
            .split('\n');

        templateOutput.splice(includeDirective.index, 1, ...includeContent);
    }

    // *** Nav link processing, this one I like! ***
    let activePageLinkIndex = 0;
    const targetPageURI = file.replace(TEMPLATE_EXTENSION, '.html');

    for (let i = 0; i < templateOutput.length; ++i) {
        if (templateOutput[i].trim().startsWith(`<li><a href="${targetPageURI}"`)) {
            activePageLinkIndex = i;
            break;
        }
    }

    if (activePageLinkIndex) {
        const elSpan = templateOutput[activePageLinkIndex]
            .replace(`<a href="${targetPageURI}">`, '<span>')
            .replace('</a>', '</span>');

        templateOutput.splice(activePageLinkIndex, 1, elSpan);
    }

    // Write to file, be happy
    await writeFile(path.join(outputDir, targetPageURI), templateOutput.join('\n'), 'utf-8');
    console.log(` > Wrote to ${targetPageURI}!\n`)
}
