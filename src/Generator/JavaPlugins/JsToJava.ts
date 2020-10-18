import { IGeneratorPlugin } from "../IGeneratorPlugin";
import { InstanceMethodCallExpression, Expression, StaticMethodCallExpression, RegexLiteral, ElementAccessExpression, ArrayLiteral } from "../../One/Ast/Expressions";
import { Statement } from "../../One/Ast/Statements";
import { ClassType, InterfaceType, LambdaType, TypeHelper } from "../../One/Ast/AstTypes";
import { Class, Lambda, Method } from "../../One/Ast/Types";
import { InstanceFieldReference, InstancePropertyReference, VariableDeclarationReference, VariableReference } from "../../One/Ast/References";
import { IExpression, IType } from "../../One/Ast/Interfaces";
import { JavaGenerator } from "../JavaGenerator";

export class JsToJava implements IGeneratorPlugin {
    unhandledMethods = new Set<string>();

    constructor(public main: JavaGenerator) { }

    isArray(arrayExpr: Expression) {
        // TODO: InstanceMethodCallExpression is a hack, we should introduce real stream handling
        return arrayExpr instanceof VariableReference && !arrayExpr.getVariable().mutability.mutated ||
            arrayExpr instanceof StaticMethodCallExpression || arrayExpr instanceof InstanceMethodCallExpression;
    }

    arrayStream(arrayExpr: Expression) {
        const isArray = this.isArray(arrayExpr);
        const objR = this.main.expr(arrayExpr);
        if (isArray)
            this.main.imports.add("java.util.Arrays");
        return isArray ? `Arrays.stream(${objR})` : `${objR}.stream()`;
    }

    toArray(arrayType: IType, typeArgIdx: number = 0) {
        const type = (<ClassType>arrayType).typeArguments[typeArgIdx];
        return `toArray(${this.main.type(type)}[]::new)`;
    }

    convertMethod(cls: Class, obj: Expression, method: Method, args: Expression[], returnType: IType): string {
        const objR = this.main.expr(obj);
        const argsR = args.map(x => this.main.expr(x));
        if (cls.name === "TsArray") {
            if (method.name === "includes") {
                return `${this.arrayStream(obj)}.anyMatch(${argsR[0]}::equals)`;
            } else if (method.name === "set") {
                if (this.isArray(obj))
                    return `${objR}[${argsR[0]}] = ${argsR[1]}`;
                else
                    return `${objR}.set(${argsR[0]}, ${argsR[1]})`;
            } else if (method.name === "get") {
                return this.isArray(obj) ? `${objR}[${argsR[0]}]` : `${objR}.get(${argsR[0]})`;
            } else if (method.name === "join") {
                this.main.imports.add("java.util.stream.Collectors");
                return `${this.arrayStream(obj)}.collect(Collectors.joining(${argsR[0]}))`;
            } else if (method.name === "map") {
                //if (returnType.repr() !== "C:TsArray<C:TsString>") debugger;
                return `${this.arrayStream(obj)}.map(${argsR[0]}).${this.toArray(returnType)}`;
            } else if (method.name === "push") {
                return `${objR}.add(${argsR[0]})`;
            } else if (method.name === "pop") {
                return `${objR}.remove(${objR}.size() - 1)`;
            } else if (method.name === "filter") {
                return `${this.arrayStream(obj)}.filter(${argsR[0]}).${this.toArray(returnType)}`;
            } else if (method.name === "every") {
                return `StdArrayHelper.allMatch(${objR}, ${argsR[0]})`;
            } else if (method.name === "some") {
                return `${this.arrayStream(obj)}.anyMatch(${argsR[0]})`;
            } else if (method.name === "concat") {
                this.main.imports.add("java.util.stream.Stream");
                return `Stream.of(${objR}, ${argsR[0]}).flatMap(Stream::of).${this.toArray(obj.getType())}`;
            } else if (method.name === "shift") {
                return `${objR}.remove(0)`;
            } else if (method.name === "find") {
                return `${this.arrayStream(obj)}.filter(${argsR[0]}).findFirst().orElse(null)`;
            }
        } else if (cls.name === "TsString") {
            if (method.name === "replace") {
                if (args[0] instanceof RegexLiteral) {
                    this.main.imports.add("java.util.regex.Pattern");
                    return `${objR}.replaceAll(Pattern.quote(${JSON.stringify((<RegexLiteral>args[0]).pattern)}), ${argsR[1]})`;
                }

                return `${argsR[0]}.replace(${objR}, ${argsR[1]})`;
            } else if (method.name === "charCodeAt") {
                return `(int)${objR}.charAt(${argsR[0]})`;
            } else if (method.name === "includes") {
                return `${objR}.contains(${argsR[0]})`;
            } else if (method.name === "get") {
                return `${objR}.substring(${argsR[0]}, ${argsR[0]} + 1)`;
            } else if (method.name === "substr") {
                return argsR.length === 1 ? `${objR}.substring(${argsR[0]})` : `${objR}.substring(${argsR[0]}, ${argsR[0]} + ${argsR[1]})`;
            } else if (method.name === "substring") {
                return `${objR}.substring(${argsR[0]}, ${argsR[1]})`;
            }
            
            if (method.name === "split" && args[0] instanceof RegexLiteral) {
                const pattern = (<RegexLiteral>args[0]).pattern;
                return `${objR}.split(${JSON.stringify(pattern)})`;
            }


            // if (method.name === "split") {
            //     if (args[0] instanceof RegexLiteral) {
            //         const pattern = (<RegexLiteral>args[0]).pattern;
            //         if (!pattern.startsWith("^")) {
            //             //return `${objR}.split(${JSON.stringify(pattern)})`;
            //             this.main.imports.add("import re");
            //             return `re.split(${JSON.stringify(pattern)}, ${objR})`;
            //         }
            //     }

            //     return `${argsR[0]}.split(${objR})`;
            // } else if (method.name === "replace") {
            //     if (args[0] instanceof RegexLiteral) {
            //         this.main.imports.add("import re");
            //         return `re.sub(${JSON.stringify((<RegexLiteral>args[0]).pattern)}, ${argsR[1]}, ${objR})`;
            //     }

            //     return `${argsR[0]}.replace(${objR}, ${argsR[1]})`;
            // } else if (method.name === "startsWith") {
            //     return `${objR}.startswith(${argsR.join(", ")})`;
            // } else if (method.name === "indexOf") {
            //     return `${objR}.find(${argsR[0]}, ${argsR[1]})`;
            // } else if (method.name === "lastIndexOf") {
            //     return `${objR}.rfind(${argsR[0]}, 0, ${argsR[1]})`;
            // } else if (method.name === "substr") {
            //     return argsR.length === 1 ? `${objR}[${argsR[0]}:]` : `${objR}[${argsR[0]}:${argsR[0]} + ${argsR[1]}]`;
            // } else if (method.name === "substring") {
            //     return `${objR}[${argsR[0]}:${argsR[1]}]`;
            // } else if (method.name === "repeat") {
            //     return `${objR} * (${argsR[0]})`;
            // } else if (method.name === "toUpperCase") {
            //     return `${objR}.upper()`;
            // } else if (method.name === "toLowerCase") {
            //     return `${objR}.lower()`;
            // } else if (method.name === "endsWith") {
            //     return `${objR}.endswith(${argsR[0]})`;
            // } else if (method.name === "get") {
            //     return `${objR}[${argsR[0]}]`;
            // }
        } else if (cls.name === "TsMap" || cls.name === "Map") {
            if (method.name === "set") {
                return `${objR}.put(${argsR[0]}, ${argsR[1]})`;
            } else if (method.name === "get") {
                return `${objR}.get(${argsR[0]})`;
            } else if (method.name === "hasKey" || method.name === "has") {
                return `${objR}.containsKey(${argsR[0]})`;
            } else if (method.name === "delete") {
                return `${objR}.remove(${argsR[0]})`;
            } else if (method.name === "values") {
                return `${objR}.values().${this.toArray(obj.getType(), 1)}`;
            }
        } else if (cls.name === "Object") {
            if (method.name === "keys") {
                return `${argsR[0]}.keySet().toArray(String[]::new)`;
            } else if (method.name === "values") {
                return `${argsR[0]}.values().${this.toArray(args[0].getType())}`;
            }
        } else if (cls.name === "Set") {
            if (method.name === "values") {
                return `${objR}.${this.toArray(obj.getType())}`;
            } else if (method.name === "has") {
                return `${objR}.contains(${argsR[0]})`;
            } else if (method.name === "add") {
                return `${objR}.add(${argsR[0]})`;
            }
        } else if (cls.name === "ArrayHelper") {
            // if (method.name === "sortBy") {
            //     return `sorted(${argsR[0]}, key=${argsR[1]})`;
            // } else if (method.name === "removeLastN") {
            //     return `del ${argsR[0]}[-${argsR[1]}:]`;
            // }
        } else if (cls.name === "Array") {
            if (method.name === "from") {
                return `${argsR[0]}`;
            }
        } else if (cls.name === "Promise") {
            if (method.name === "resolve") {
                return `${argsR[0]}`;
            }
        } else if (cls.name === "RegExpExecArray") {
            if (method.name === "get") {
                return `${objR}[${argsR[0]}]`;
            }
        } else {
            return null;
        }

        const methodName = `${cls.name}.${method.name}`;
        if (!this.unhandledMethods.has(methodName)) {
            console.error(`[JsToJava] Method was not handled: ${cls.name}.${method.name}`);
            this.unhandledMethods.add(methodName);
        }
        //debugger;
        return null;
    }

    expr(expr: IExpression): string {
        if (expr instanceof InstanceMethodCallExpression && expr.object.actualType instanceof ClassType) {
            return this.convertMethod(expr.object.actualType.decl, expr.object, expr.method, expr.args, expr.actualType);
        } else if (expr instanceof InstancePropertyReference && expr.object.actualType instanceof ClassType) {
            if (expr.property.parentClass.name === "TsString" && expr.property.name === "length")
                return `${this.main.expr(expr.object)}.length()`;
            if (expr.property.parentClass.name === "TsArray" && expr.property.name === "length")
                return `${this.main.expr(expr.object)}.${this.isArray(expr.object) ? "length" : "size()"}`;
                //return `${this.main.expr(expr.object)}.${expr.getVariable().mutability.mutated ? "size" : "length"}()`;
        } else if (expr instanceof InstanceFieldReference && expr.object.actualType instanceof ClassType) {
            if (expr.field.parentInterface.name === "RegExpExecArray" && expr.field.name === "length")
                return `${this.main.expr(expr.object)}.length`;
        } else if (expr instanceof StaticMethodCallExpression && expr.method.parentInterface instanceof Class) {
            return this.convertMethod(expr.method.parentInterface, null, expr.method, expr.args, expr.actualType);
        }
        return null;
    }
    
    stmt(stmt: Statement): string {
        return null;
    }

}