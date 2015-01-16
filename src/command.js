/**
 * Command class.
 *
 * @copyright   copyright (c) 2015 by Harald Lapp
 * @author      Harald Lapp <harald@octris.org>
 */

var option = require('./option.js');
var operand = require('./operand.js');
var events = require('events');

/**
 * Constructor.
 */
function command(name)
{
    this.commands = {};
    this.options = [];
    this.operands = [];
    this.map = {};

    this.description = '';
    this.action = function() {};
}

/**
 * Inherit EventEmitter.
 */
command.prototype = Object.create(events.EventEmitter.prototype);
command.prototype.constructor = command;

/**
 * Setter for the command description.
 *
 * @param   string          str         Command description.
 * @return  string|app                  Returns class instance.
 */
command.prototype.setDescription = function(str)
{
    this.description = str;

    return this;
}

/**
 * Set action to call if command appears in arguments.
 *
 * @param   callable        fn              Function to call.
 */
command.prototype.setAction = function(fn)
{
    this.action = fn;
}

/**
 * Define a new command.
 *
 * @param   string          name            Name of command.
 * @return  command                         Instance of new command object.
 */
command.prototype.addCommand = function(name)
{
    this.commands[name] = new command(name);

    return this.commands[name];
}

/**
 * Create a new option for command.
 *
 * @param   string          name            Internal name of option.
 * @param   string          type            Type of option.
 * @param   array           flags           Option flags.
 * @param   object          options         Optional additional settings.
 * @return  Option                          Instance of created option.
 */
command.prototype.addOption = function(name, type, flags, options)
{
    var ret = new option(name, type, flags, options);

    this.options.push(ret);

    return ret;
}

/**
 * Create a new operand (positional argument).
 *
 * @param   string          name            Internal name of operand.
 * @param   int|string      num             Number of arguments.
 * @param   object          options         Optional additional settings.
 * @return  Operand                         Instance of created operand.
 */
command.prototype.addOperand = function(name, num, options)
{
    var ret = new operand(name, num, options);

    this.operands.push(ret);

    return ret;
}

/**
 * Lookup a defined option for a specified flag.
 *
 * @param   string          flag            Option flag.
 * @return  Option|bool                     Returns the option instance or 'false' if no option was found.
 */
command.prototype.getOption = function(flag)
{
    var ret = false;

    for (var i = 0, cnt = this.options.length; i < cnt; ++i) {
        if (this.options[i].isFlag(flag)) {
            ret = this.options[i];
            break;
        }
    }

    return ret;
}

/**
 * Return min/max expected number of operands
 *
 * @return  array                           Min, max expected number of operands.
 */
command.prototype.getMinMaxOperands = function()
{
    var min = 0;
    var max = 0;

    this.operands.forEach(function(operand)  {
        var mm = operand.getExpected();

        min += mm[0];

        if (max !== Infinity) {
            if (mm[1] === Infinity) {
                max = Infinity;
            } else {
                max += mm[1];
            }
        }
    });

    return [min, max];
}

/**
 * Get remaining minimum number of operands expected.
 *
 * @param   int             n               Number of operand to begin with to calculate remaining minimum expected operands.
 */
command.prototype.getMinRemaining = function(n)
{
    var ret = 0;

    this.operands.slice(n).forEach(function(operand) {
        ret += operand.getExpected()[0];
    });

    return ret;
}

/**
 * Process and validate operands.
 *
 * @param   array           args            Operandal arguments to validate.
 * @return  object                          Validated arguments.
 */
command.prototype.processOperands = function(args)
{
    var name, remaining;

    var operand = null;
    var ret = {};
    var op = 0;
    var minmax = this.getMinMaxOperands();

    if (minmax[0] > args.length) {
        console.log('not enough arguments -- available ' + args.length + ', expected ' + minmax[0]);
        process.exit(1);
    } else if (minmax[1] !== Infinity && minmax[1] < args.length) {
        console.log('too many arguments -- available ' + args.length + ', expected ' + minmax[1]);
        process.exit(1);
    }

    while (args.length > 0) {
        if (operand === null) {
            // fetch next operand
            operand = this.operands[op];

            minmax = operand.getExpected();
            name = operand.getName();

            ++op;

            remaining = this.getMinRemaining(op);
        }

        if (minmax[0] > ret[metavar] || (minmax[1] === Infinity && remaining > args.length)) {
            // expected operand
            arg = args.shift();

            if (!operand.isValid(arg)) {
                console.log('invalid value "' + arg + '" for operand');
                process.exit(1);
            }

            operand.update(arg);
            ret[operand.getName()] = operand.getData();
        } else {
            // trigger fetching next operand
            operand = null;
        }
    }

    return ret;
}

/**
 * Parse arguments for command.
 *
 * @param   array           argv            Array of arguments.
 */
command.prototype.parse = function(argv)
{
    var arg, match, option;

    var args = [];
    var options = {};
    var operands = false;

    var mm = this.getMinMaxOperands();

    while ((arg = argv.shift())) {
        if (operands) {
            //
            args.push(arg);
            continue;
        }

        if (arg == '--') {
            // only operands following
            operands = true;
            continue;
        }

        if ((match = arg.match(/^(-[a-z0-9])([a-z0-9]*)()$/)) ||
            (match = arg.match(/^(--[a-z][a-z0-9-]*)()(=.*|)$/i))) {
            // option argument

            if (match[3].length > 0) {
                // push back value
                argv.unshift(match[3].substring(1));
            }

            if (!(option = this.getOption(match[1]))) {
                // unknown option
                console.log('unknown argument "' + match[1] + '"');
                process.exit(1);
            }

            if (option.takesValue()) {
                if ((arg = argv.shift())) {
                    // value required
                    if (!option.isValid(arg)) {
                        console.log('invalid value for argument "' + match[1] + '"')
                        process.exit(1);
                    } else {
                        option.update(arg);
                    }
                } else {
                    console.log('value missing for argument "' + match[1] + '"');
                    process.exit(1);
                }
            } else {
                option.update();
            }

            // option.action(option.value);
            options[option.getName()] = option.getValue();

            if (match[2].length > 0) {
                // push back combined short argument
                argv.unshift('-' + match[2]);
            }
        } else if (args.length < mm[1]) {
            // expected operand
            args.push(arg);
        } else if (arg in this.commands) {
            // sub command
            args = this.processOperands(args);

            this.action(options, args);

            this.commands[arg].parse(argv);
        } else {
            console.log('too many arguments for "' + arg + '"');
            process.exit(1);
            break;  // no further arguments should be parsed
        }
    }

    args = this.processOperands(args);

    this.action(options, args);
}

// export
module.exports = command;
