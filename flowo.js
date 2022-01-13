const Flowo = (function () {
    class FlowoTokenizeError extends Error {}
    const TokenTypes = {
        Number: Symbol("Flowo.TokenTypes.Number"),
        String: Symbol("Flowo.TokenTypes.String"),
        Operator: Symbol("Flowo.TokenTypes.Operator"),
        Word: Symbol("Flowo.TokenTypes.Word"),
        Whitespace: Symbol("Flowo.TokenTypes.Whitespace"),
        OpenParenthesis: Symbol("Flowo.TokenTypes.OpenParenthesis"),
        CloseParenthesis: Symbol("Flowo.TokenTypes.CloseParenthesis"),
        OpenSquare: Symbol("Flowo.TokenTypes.OpenSquare"),
        CloseSquare: Symbol("Flowo.TokenTypes.CloseSquare"),
        // used in shunting:
        OpenParenthesisCall: Symbol("Flowo.TokenTypes.OpenParenthesisCall"),
    };
    
    const mergeDefaults = (...objs) => {
        let base = {};
        for(let obj of objs) {
            Object.assign(base, obj);
        }
        return base;
    };
    
    const arityCase = (map) =>
        (...args) => map[args.length](...args);            
    
    const DefaultOptions = {
        operators: {
            "+": arityCase({
                2: (a, b) => a + b,
            }),
            "*": (a, b) => a * b,
            "/": (a, b) => a / b,
            "-": arityCase({
                1: (a) => -a,
                2: (a, b) => a - b,
            }),
            "^": (a, b) => a**b,
            ",": (a, b) => b && a,
            ";": (a, b) => b,
            
            ">": (a, b) => a > b,
            "<": (a, b) => a < b,
            ">=": (a, b) => a >= b,
            "<=": (a, b) => a <= b,
            "=": (a, b) => a == b,
            "!=": (a, b) => a != b,
            
            "in": (a, b) => b.includes(a),
            
            "and": (a, b) => a && b,
            "&": (a, b) => a && b,
            "or": (a, b) => a || b,
            "|": (a, b) => a || b,
        },
        variables: {},
        precedence: {
            ";": 0,
            ",": 5,
            
            "or": 10,
            "|": 10,
            "and": 15,
            "&": 15,
            
            "in": 20,
            "=": 20,
            "!=": 20,
            ">": 20,
            "<": 20,
            "<=": 20,
            ">=": 20,
            
            "+": 30,
            "-": 30,
            
            "*": 40,
            "/": 40,
            
            "^": 60,
        },
        rightAssociative: ["^"],
        isWordStart: (ch) => (/^\w$/).test(ch),
        isWordBody: (ch) => (/^[\w]$/).test(ch),
        isWhitespace: (ch) => (/^\s$/).test(ch),
        isNumberStart: (ch) => (/^\d$/).test(ch),
        isNumberBody: (ch) => (/^[\d.]$/).test(ch),
        isStringHead: (ch) => (/^["']$/).test(ch), //TODO: string escaping
    };
    const tokenize = function* (string, options) {
        let {
            operators,
            isWordStart,
            isWordBody,
            isWhitespace,
            isNumberStart,
            isNumberBody,
            isStringHead,
        } = mergeDefaults(DefaultOptions, options);
        // order keys longest to shortest
        let opKeys = Object.keys(operators).sort((a, b) => b.length - a.length);
        let i = 0;
        let arrayDepth = 0;
        while(i < string.length) {
            let token = {
                raw: "",
                start: i,
                type: null,
            };
            let substring = string.slice(i);
            for(let op of opKeys) {
                if(substring.startsWith(op)) {
                    token.raw = op;
                    token.type = TokenTypes.Operator;
                    i += op.length;
                    break;
                }
            }
            if(!token.raw) {
                if(isNumberStart(string[i])) {
                    token.type = TokenTypes.Number;
                    while(isNumberBody(string[i])) {
                        token.raw += string[i];
                        i++;
                    }
                }
                else if(isStringHead(string[i])) {
                    token.type = TokenTypes.String;
                    let head = string[i];
                    token.raw += head;
                    i++;
                    while(i < string.length && !isStringHead(string[i])) {
                        token.raw += string[i];
                        i++;
                    }
                    token.raw += string[i];
                    i++;
                }
                else if(isWordStart(string[i])) {
                    token.type = TokenTypes.Word;
                    while(isWordBody(string[i])) {
                        token.raw += string[i];
                        i++;
                    }
                }
                else if(isWhitespace(string[i])) {
                    token.type = TokenTypes.Whitespace;
                    while(isWhitespace(string[i])) {
                        token.raw += string[i];
                        i++;
                    }
                }
                else if(string[i] === "(") {
                    token.type = TokenTypes.OpenParenthesis;
                    token.raw = string[i];
                    i++;
                }
                else if(string[i] === ")") {
                    token.type = TokenTypes.CloseParenthesis;
                    token.raw = string[i];
                    i++;
                }
                else if(string[i] === "[") {
                    token.type = TokenTypes.OpenSquare;
                    token.raw = string[i];
                    i++;
                    arrayDepth++;
                }
                else if(string[i] === "]") {
                    token.type = TokenTypes.CloseSquare;
                    token.raw = string[i];
                    i++;
                    if(arrayDepth) {
                        arrayDepth--;
                    }
                    else {
                        throw new FlowoTokenizeError("Mismatched brackets at position " + i);
                    }
                }
                else {
                    throw new FlowoTokenizeError("Unrecognized character `" + string[i] + "` at position " + i);
                }
            }
            yield token;
        }
    };
    const CompiledInstructions = {
        RAW_VALUE:      Symbol("Flowo.CompiledInstructions.RAW_VALUE"),
        CALL_OP:        Symbol("Flowo.CompiledInstructions.CALL_OP"),
        MAKE_ARRAY:     Symbol("Flowo.CompiledInstructions.MAKE_ARRAY"),
        VARIABLE:       Symbol("Flowo.CompiledInstructions.VARIABLE"),
        CALL_FUNC:      Symbol("Flowo.CompiledInstructions.CALL_FUNC"),
    };
    const shunt = function* (tokens, options) {
        let {
            operators,
            precedence,
            rightAssociative,
        } = mergeDefaults(DefaultOptions, options);
        let opStack = [];
        let lastToken = null;
        let lastWasData = false;
        let arities = [];
        const flushTo = function* (...types) {
            while(opStack.length && !types.includes(opStack.at(-1).type)) {
                // console.log("INPUT:", types);
                yield opFrom(opStack.pop());
            }
        };
        const opFrom = (op) =>
            [ CompiledInstructions.CALL_OP, op.raw, op.arity ];
        const parseString = (str) =>
            str.slice(1, -1);
        
        for(let token of tokens) {
            let { type } = token;
            let currentIsData = false;
            if(type === TokenTypes.Number) {
                currentIsData = true;
                let nval = parseFloat(token.raw);
                yield [ CompiledInstructions.RAW_VALUE, nval ];
            }
            else if(type === TokenTypes.String) {
                currentIsData = true;
                let sval = parseString(token.raw);
                yield [ CompiledInstructions.RAW_VALUE, sval ];
            }
            else if(token.raw === "," && arities.length) {
                arities.push(arities.pop() + 1);
                yield* flushTo(TokenTypes.OpenSquare, TokenTypes.OpenParenthesisCall);
            }
            else if(type === TokenTypes.Operator) {
                let top;
                let arity = lastWasData ? 2 : 1;
                if(arity === 2) {
                    // unary operators do not care about shunting
                    while(opStack.length) {
                        top = opStack.at(-1);
                        if(top.type === TokenTypes.OpenParenthesis) break;
                        let moveTop = rightAssociative.includes(token.raw)
                            ? precedence[top.raw] >  precedence[token.raw]
                            : precedence[top.raw] >= precedence[token.raw];
                        if(moveTop) {
                            yield opFrom(opStack.pop());
                        }
                        break;
                    }
                }
                opStack.push(Object.assign({ arity }, token));
            }
            else if(type === TokenTypes.Word) {
                currentIsData = true;
                yield [ CompiledInstructions.VARIABLE, token.raw ];
            }
            else if(type === TokenTypes.OpenParenthesis) {
                if(lastWasData) {
                    opStack.push(Object.assign({}, token, { type: TokenTypes.OpenParenthesisCall }));
                    arities.push(1);
                }
                else {
                    opStack.push(token);
                }
            }
            else if(type === TokenTypes.CloseParenthesis) {
                currentIsData = true;
                yield* flushTo(TokenTypes.OpenParenthesis, TokenTypes.OpenParenthesisCall);
                let opener = opStack.pop();
                if(opener.type === TokenTypes.OpenParenthesisCall) {
                    let arity = arities.pop();
                    if(lastToken.type === TokenTypes.OpenParenthesis) {
                        arity = 0;
                    }
                    yield [ CompiledInstructions.CALL_FUNC, arity ];
                }
            }
            else if(type === TokenTypes.OpenSquare) {
                opStack.push(token);
                arities.push(1);
            }
            else if(type === TokenTypes.CloseSquare) {
                currentIsData = true;
                let arity = arities.pop();
                if(lastToken.type === TokenTypes.OpenSquare) {
                    arity = 0;
                }
                yield* flushTo(TokenTypes.OpenSquare);
                opStack.pop(); // pop open bracket
                yield [ CompiledInstructions.MAKE_ARRAY, arity ];
            }
            else if(type === TokenTypes.Whitespace) {
                // don't update lastToken
                continue;
            }
            else {
                yield ["???", token.raw, token.type.toString()];
            }
            lastToken = token;
            lastWasData = currentIsData;
        }
        yield* opStack.reverse()
                      .map(opFrom);
    };
    
    const evaluate = (shunted, options) => {
        let {
            operators,
            variables,
        } = mergeDefaults(DefaultOptions, options);
        let stack = [];
        for(let statement of shunted) {
            let [ command, ...args ] = statement;
            if(command === CompiledInstructions.RAW_VALUE) {
                let val = args[0];
                stack.push(args[0]);
            }
            else if(command === CompiledInstructions.CALL_OP) {
                let opName = args[0];
                let arity = args[1];
                let opArgs = stack.splice(-arity);
                let opFn = operators[opName];
                let val = opFn(...opArgs);
                stack.push(val);
            }
            else if(command === CompiledInstructions.MAKE_ARRAY) {
                let count = args[0];
                let arr;
                if(count === 0) {
                    arr = [];
                }
                else {
                    arr = stack.splice(-count);
                }
                stack.push(arr);
            }
            else if(command === CompiledInstructions.VARIABLE) {
                let name = args[0];
                stack.push(variables[name]);
            }
            else {
                console.log("UNKNOWN:", statement);
            }
        }
        return stack.at(-1);
    };
    
    const exec = (string, options = {}) => {
        let tokenStream = tokenize(string, options);
        let shunted = shunt(tokenStream, options);
        let evaluated = evaluate(shunted, options);
        return evaluated;
    };
    
    return {
        TokenTypes: TokenTypes,
        tokenize,
        shunt,
        evaluate,
        exec
    };
})();

if(typeof module !== "undefined") {
    module.exports = Flowo;
}