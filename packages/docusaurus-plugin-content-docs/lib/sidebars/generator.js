"use strict";
/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultSidebarItemsGenerator = exports.CategoryMetadataFilenamePattern = exports.CategoryMetadataFilenameBase = void 0;
const tslib_1 = require("tslib");
const path_1 = tslib_1.__importDefault(require("path"));
const lodash_1 = tslib_1.__importDefault(require("lodash"));
const logger_1 = tslib_1.__importDefault(require("@docusaurus/logger"));
const utils_1 = require("@docusaurus/utils");
const docs_1 = require("../docs");
const BreadcrumbSeparator = '/';
// Just an alias to the make code more explicit
function getLocalDocId(docId) {
    return lodash_1.default.last(docId.split('/'));
}
exports.CategoryMetadataFilenameBase = '_category_';
exports.CategoryMetadataFilenamePattern = '_category_.{json,yml,yaml}';
// Comment for this feature: https://github.com/facebook/docusaurus/issues/3464#issuecomment-818670449
const DefaultSidebarItemsGenerator = ({ numberPrefixParser, isCategoryIndex, docs: allDocs, item: { dirName: autogenDir }, categoriesMetadata, }) => {
    const docsById = (0, docs_1.createDocsByIdIndex)(allDocs);
    const findDoc = (docId) => docsById[docId];
    const getDoc = (docId) => {
        const doc = findDoc(docId);
        if (!doc) {
            throw new Error(`Can't find any doc with ID ${docId}.
Available doc IDs:
- ${Object.keys(docsById).join('\n- ')}`);
        }
        return doc;
    };
    /**
     * Step 1. Extract the docs that are in the autogen dir.
     */
    function getAutogenDocs() {
        function isInAutogeneratedDir(doc) {
            return (
            // Doc at the root of the autogenerated sidebar dir
            doc.sourceDirName === autogenDir ||
                // Autogen dir is . and doc is in subfolder
                autogenDir === '.' ||
                // Autogen dir is not . and doc is in subfolder
                // "api/myDoc" startsWith "api/" (note "api2/myDoc" is not included)
                doc.sourceDirName.startsWith((0, utils_1.addTrailingSlash)(autogenDir)));
        }
        const docs = allDocs.filter(isInAutogeneratedDir);
        if (docs.length === 0) {
            logger_1.default.warn `No docs found in path=${autogenDir}: can't auto-generate a sidebar.`;
        }
        return docs;
    }
    /**
     * Step 2. Turn the linear file list into a tree structure.
     */
    function treeify(docs) {
        // Get the category breadcrumb of a doc (relative to the dir of the
        // autogenerated sidebar item)
        // autogenDir=a/b and docDir=a/b/c/d => returns [c, d]
        // autogenDir=a/b and docDir=a/b => returns []
        // TODO: try to use path.relative()
        function getRelativeBreadcrumb(doc) {
            return autogenDir === doc.sourceDirName
                ? []
                : doc.sourceDirName
                    .replace((0, utils_1.addTrailingSlash)(autogenDir), '')
                    .split(BreadcrumbSeparator);
        }
        const treeRoot = {};
        docs.forEach((doc) => {
            const breadcrumb = getRelativeBreadcrumb(doc);
            // We walk down the file's path to generate the fs structure
            let currentDir = treeRoot;
            breadcrumb.forEach((dir) => {
                if (typeof currentDir[dir] === 'undefined') {
                    currentDir[dir] = {}; // Create new folder.
                }
                currentDir = currentDir[dir]; // Go into the subdirectory.
            });
            // We've walked through the path. Register the file in this directory.
            currentDir[path_1.default.basename(doc.source)] = doc.id;
        });
        return treeRoot;
    }
    /**
     * Step 3. Recursively transform the tree-like structure to sidebar items.
     * (From a record to an array of items, akin to normalizing shorthand)
     */
    function generateSidebar(fsModel) {
        function createDocItem(id, fullPath, fileName) {
            const { sidebarPosition: position, frontMatter: { sidebar_label: label, sidebar_class_name: className, sidebar_custom_props: customProps, }, } = getDoc(id);
            return {
                type: 'doc',
                id,
                position,
                source: fileName,
                // We don't want these fields to magically appear in the generated
                // sidebar
                ...(label !== undefined && { label }),
                ...(className !== undefined && { className }),
                ...(customProps !== undefined && { customProps }),
            };
        }
        function createCategoryItem(dir, fullPath, folderName) {
            const categoryMetadata = categoriesMetadata[path_1.default.posix.join(autogenDir, fullPath)];
            const allItems = Object.entries(dir).map(([key, content]) => dirToItem(content, key, `${fullPath}/${key}`));
            // Try to match a doc inside the category folder,
            // using the "local id" (myDoc) or "qualified id" (dirName/myDoc)
            function findDocByLocalId(localId) {
                return allItems.find((item) => item.type === 'doc' && getLocalDocId(item.id) === localId);
            }
            function findConventionalCategoryDocLink() {
                return allItems.find((item) => {
                    if (item.type !== 'doc') {
                        return false;
                    }
                    const doc = getDoc(item.id);
                    return isCategoryIndex((0, docs_1.toCategoryIndexMatcherParam)(doc));
                });
            }
            // In addition to the ID, this function also retrieves metadata of the
            // linked doc that could be used as fallback values for category metadata
            function getCategoryLinkedDocMetadata() {
                const link = categoryMetadata?.link;
                if (link !== undefined && link?.type !== 'doc') {
                    // If a link is explicitly specified, we won't apply conventions
                    return undefined;
                }
                const id = link
                    ? findDocByLocalId(link.id)?.id ?? getDoc(link.id).id
                    : findConventionalCategoryDocLink()?.id;
                if (!id) {
                    return undefined;
                }
                const doc = getDoc(id);
                return {
                    id,
                    position: doc.sidebarPosition,
                    label: doc.frontMatter.sidebar_label ?? doc.title,
                    customProps: doc.frontMatter.sidebar_custom_props,
                    className: doc.frontMatter.sidebar_class_name,
                };
            }
            const categoryLinkedDoc = getCategoryLinkedDocMetadata();
            const link = categoryLinkedDoc
                ? {
                    type: 'doc',
                    id: categoryLinkedDoc.id, // We "remap" a potentially "local id" to a "qualified id"
                }
                : categoryMetadata?.link;
            // If a doc is linked, remove it from the category subItems
            const items = allItems.filter((item) => !(item.type === 'doc' && item.id === categoryLinkedDoc?.id));
            const className = categoryMetadata?.className ?? categoryLinkedDoc?.className;
            const customProps = categoryMetadata?.customProps ?? categoryLinkedDoc?.customProps;
            const { filename, numberPrefix } = numberPrefixParser(folderName);
            return {
                type: 'category',
                label: categoryMetadata?.label ?? categoryLinkedDoc?.label ?? filename,
                collapsible: categoryMetadata?.collapsible,
                collapsed: categoryMetadata?.collapsed,
                position: categoryMetadata?.position ??
                    categoryLinkedDoc?.position ??
                    numberPrefix,
                source: folderName,
                ...(customProps !== undefined && { customProps }),
                ...(className !== undefined && { className }),
                items,
                ...(link && { link }),
            };
        }
        function dirToItem(dir, // The directory item to be transformed.
        itemKey, // File/folder name; for categories, it's used to generate the next `relativePath`.
        fullPath) {
            return typeof dir === 'object'
                ? createCategoryItem(dir, fullPath, itemKey)
                : createDocItem(dir, fullPath, itemKey);
        }
        return Object.entries(fsModel).map(([key, content]) => dirToItem(content, key, key));
    }
    /**
     * Step 4. Recursively sort the categories/docs + remove the "position"
     * attribute from final output. Note: the "position" is only used to sort
     * "inside" a sidebar slice. It is not used to sort across multiple
     * consecutive sidebar slices (i.e. a whole category composed of multiple
     * autogenerated items)
     */
    function sortItems(sidebarItems) {
        const processedSidebarItems = sidebarItems.map((item) => {
            if (item.type === 'category') {
                return { ...item, items: sortItems(item.items) };
            }
            return item;
        });
        const sortedSidebarItems = lodash_1.default.sortBy(processedSidebarItems, [
            'position',
            'source',
        ]);
        return sortedSidebarItems.map(({ position, source, ...item }) => item);
    }
    // TODO: the whole code is designed for pipeline operator
    const docs = getAutogenDocs();
    const fsModel = treeify(docs);
    const sidebarWithPosition = generateSidebar(fsModel);
    const sortedSidebar = sortItems(sidebarWithPosition);
    return sortedSidebar;
};
exports.DefaultSidebarItemsGenerator = DefaultSidebarItemsGenerator;
