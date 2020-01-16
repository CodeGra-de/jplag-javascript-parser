const assert = require('assert');
const fs = require('fs')
const acorn = require("acorn");
const acornLoose = require("acorn-loose");
const { visit } = require('ast-types');
const acornPlugins = [
    require('acorn-import-meta'),
    require('acorn-numeric-separator'),
    require('acorn-bigint'),
    require('acorn-jsx')(),
];
const acornLoosePlugins = [
    require('acorn-import-meta'),
    require('acorn-numeric-separator'),
    require('acorn-bigint'),
];

const TOKENS = {
    FOR_BEGIN: 2,
    FOR_END: 3,
    FUNCTION_BEGIN: 4,
    FUNCTION_END: 5,
    BREAK: 6,
    APPLY: 7, // CALL expression
    IF_BEGIN: 8,
    IF_END: 9,
    ELSE: 10,
    CONTINUE: 11,
    CLASS_BEGIN: 12,
    CLASS_END: 13,
    IN_CLASS_BEGIN: 14,
    IN_CLASS_END: 15,
    WITH_BEGIN: 16,
    WITH_END: 17,
    SWITCH_BEGIN: 18,
    SWITCH_END: 19,
    CASE: 20,
    RETURN: 21,
    THROW: 22,
    TRY: 23,
    CATCH_BEGIN: 24,
    CATCH_END: 25,
    WHILE_BEGIN: 26,
    WHILE_END: 27,
    DO_WHILE_BEGIN: 28,
    DO_WHILE_END: 29,
    ASSIGN: 30,
    ARRAY_BEGIN: 31,
    ARRAY_END: 32,
    OBJECT_BEGIN: 33,
    OBJECT_END: 34,
    TERNARY: 35,  // COND expression
    YIELD: 36,
    GEN_EXPR_BEGIN: 37,
    GEN_EXPR_END: 38,
    ARRAY_COMP_BEGIN: 39,
    ARRAY_COMP_END: 40,
    IMPORT: 41,
    AWAIT: 42,
    DECORATOR: 43,
    EXPORT: 44,
};
const TOKENS_REVERSE = Object.entries(TOKENS).reduce(
    (accum, [key, value]) => {
        accum[value] = key;
        return accum;
    },
    {},
);

assert(Object.keys(TOKENS).length === Object.keys(TOKENS_REVERSE).length);

function getLength(node) {
    return node.range[1] - node.range[0];
}

function ASTToTokens(ast) {
    const res = [];
    function emit(tok, node, length) {
        assert(tok != null);
        assert(node != null);
        assert(length > 0);
        node = node.value || node;

        res.push({
            token: {
                key: TOKENS_REVERSE[tok],
                value: tok,
            },
            line: node.loc.start.line,
            column: node.loc.start.column,
            length,
        });
    }

    function emitEnd(tok, node) {
        assert(tok != null);
        node = node.value || node;
        assert(node != null);
        const tokKey = TOKENS_REVERSE[tok];
        assert(tokKey.endsWith('END'));

        res.push({
            token: {
                key: tokKey,
                value: tok,
            },
            line: node.loc.end.line,
            column: Math.max(node.loc.end.column - 1, 0),
            length: 1,
        });
    }

    const T = TOKENS;

    function makeTraverser(obj) {
        return Object.entries(obj).reduce((accum, [key, value]) => {
            if (/^visit[A-Z]/.test(key)) {
                accum[key] = function(path) {
                    let traversed = false;

                    const res = value.call(this, path, path => {
                        this.traverse(path);
                        traversed = true;
                    }, node => {
                        this.visit(node);
                        traversed = true;
                    });

                    if (!traversed && !res) {
                        this.traverse(path);
                    }
                }
            } else {
                accum[key] = value;
            }
            return accum;
        }, {});
    };

    visit(ast, makeTraverser({
        visitForStatement(path, traverse) {
            emit(T.FOR_BEGIN, path, "for".length);
            traverse(path);
            emitEnd(T.FOR_END, path, "".length);
        },

        // This does both function expression, function declaration and arrow
        // function expression.
        visitFunction(path, traverse) {
            emit(T.FUNCTION_BEGIN, path, "function".length);
            traverse(path);
            emitEnd(T.FUNCTION_END, path);
        },

        visitBreakStatement({ value: node }) {
            emit(T.BREAK, node, getLength(node));
        },

        visitContinueStatement({ value: node }) {
            emit(T.CONTINUE, node, getLength(node));
        },

        visitCallExpression({ value: node }) {
            let len;
            if (node.callee.type == 'MemberExpression') {
                node = node.callee.property;
                len = getLength(node);
            } else {
                len = getLength(node.callee);
            }
            emit(T.APPLY, node, len, node + 1);
        },

        visitIfStatement(path, _, visit) {
            const node = path.value;

            emit(T.IF_BEGIN, node, "if".length);
            visit(path.get('test'));
            visit(path.get('consequent'));
            if (node.alternate) {
                // This is already after the else, so a length of 1 should do.
                emit(T.ELSE, node.alternate, 1);
                visit(path.get('alternate'));
            }
            emitEnd(T.IF_END, node);
        },

        visitClassDeclaration(path, traverse) {
            emit(T.CLASS_BEGIN, path, "class".length);
            traverse(path);
            emitEnd(T.CLASS_END, path);
        },

        visitClassExpression(path, traverse) {
            emit(T.IN_CLASS_BEGIN, path, "class".length);
            traverse(path);
            emitEnd(T.IN_CLASS_END, path);
        },

        visitWithStatement(path, traverse) {
            emit(T.WITH_BEGIN, path, "with".length);
            traverse(path);
            emitEnd(T.WITH_END, path);
        },

        visitSwitchStatement(path, traverse) {
            emit(T.SWITCH_BEGIN, path, "switch".length);
            traverse(path);
            emitEnd(T.SWITCH_END, path);
        },

        visitSwitchCase({ value: node }) {
            emit(T.CASE, node, (node.test == null ? "default" : "case").length );
        },

        visitReturnStatement({ value: node }) {
            emit(T.RETURN, node, "return".length);
        },

        visitThrowStatement({ value: node }) {
            emit(T.THROW, node, "throw".length);
        },

        visitTryStatement({ value: node }) {
            emit(T.TRY, node, "try".length);
        },

        visitCatchClause(path, traverse) {
            emit(T.CATCH_BEGIN, path, "catch".length);
            traverse(path);
            emitEnd(T.CATCH_END, path);
        },

        visitWhileStatement(path, traverse) {
            emit(T.WHILE_BEGIN, path, "while".length);
            traverse(path);
            emitEnd(T.WHILE_END, path);
        },

        visitDoWhileStatement(path, traverse) {
            emit(T.DO_WHILE_BEGIN, path, "do".length);
            traverse(path);
            emitEnd(T.DO_WHILE_END, path);
        },

        visitForOfStatement(path, _, visit,) {
            emit(T.FOR_BEGIN, path, "for".length);
            visit(path.get('left'));
            emit(T.ASSIGN, path.value.left, '='.length);
            visit(path.get('right'));
            visit(path.get('body'));
            emitEnd(T.FOR_END, path);
        },

        visitForInStatement(path, _, visit,) {
            this.visitForOfStatement(path);
            return true;
        },

        visitVariableDeclarator({ value: node }) {
            if (node.init != null) {
                emit(T.ASSIGN, node, getLength(node.id));
            }
        },

        visitArrayExpression(path, t) {
            emit(T.ARRAY_BEGIN, path, '['.length);
            t(path);
            emitEnd(T.ARRAY_END, path);
        },

        visitObjectExpression(path, t) {
            emit(T.OBJECT_BEGIN, path, '{'.length);
            t(path);
            emitEnd(T.OBJECT_END, path);
        },

        visitAssignmentExpression(path, _, visit) {
            visit(path.get('left'));
            emit(T.ASSIGN, path, path.value.operator.length);
            visit(path.get('right'));
        },

        visitUpdateExpression(path, t) {
            t(path);
            emit(T.ASSIGN, path, path.value.operator.length);
        },

        visitConditionalExpression({ value: node }) {
            emit(T.TERNARY, node, getLength(node.test) + ' ?'.length);
        },

        visitYieldExpression({ value: node }) {
            emit(T.YIELD, node, "yield".length);
        },

        visitGeneratorExpression(path, traverse) {
            emit(T.GEN_EXPR_BEGIN, path, '('.length);
            traverse(path);
            emitEnd(T.GEN_EXPR_END, path);
        },

        visitComprehensionExpression(path, traverse) {
            emit(T.ARRAY_COMP_BEGIN, path, '['.length);
            traverse(path);
            emitEnd(T.ARRAY_COMP_END, path);
        },

        visitImportDeclaration(path) {
            emit(T.IMPORT, path, 'import'.length);
        },

        visitImportExpression(path) {
            emit(T.IMPORT, path, 'import'.length);
        },

        visitAwaitExpression(path) {
            emit(T.AWAIT, path, 'await'.length);
        },

        visitDecorator(path) {
            emit(T.DECORATOR, path, '@'.length);
        },

        visitExportNamedDeclaration(path) {
            emit(T.EXPORT, path, 'export'.length);
        },

        visitExportDefaultDeclaration(path) {
            emit(T.EXPORT, path, 'export'.length);
        },

        visitExportAllDeclaration(path) {
            emit(T.EXPORT, path, 'export'.length);
        },
    }));

    return res;
}

function makeParser(base, plugins) {
    return base.extend(...plugins);
}

function parseToAst(content) {
    opts = {
        ecmaVersion: 10,
        sourceType: 'module',
        allowReturnOutsideFunction: true,
        allowImportExportEverywhere: true,
        allowHashBang: true,
        allowAwaitOutsideFunction: true,
        locations: true,
        ranges: true,
    };
    try {
        return makeParser(acorn.Parser, acornPlugins).parse(content, opts)
    } catch (e) {
        console.error('Got parse error: ' + e)
        return makeParser(
            acornLoose.LooseParser, acornLoosePlugins
        ).parse(content, opts);
    }
}

function doParse(filename) {
    const content = fs.readFileSync(filename, {
        encoding: 'utf-8'
    });
    res = ASTToTokens(parseToAst(content));
    res.sort((a, b) => {
        let diff = a.line - b.line;
        if (diff === 0) {
            diff = a.column - b.column;
        }
        return diff;
    });
    return res;
}

if (process.argv[3] === 'AMOUNT') {
    console.log(Object.keys(TOKENS).length + 1);
} else if (process.argv[3] === 'MAPPING') {
    console.log(JSON.stringify(TOKENS_REVERSE));
} else {
    console.log(JSON.stringify(doParse(process.argv[2])));
}
