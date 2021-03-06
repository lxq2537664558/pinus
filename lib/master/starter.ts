import * as cp from 'child_process';
import { getLogger } from 'pinus-logger';
 var logger = getLogger('pinus', __filename);
import * as util from 'util';
import * as utils from '../util/utils';
import * as Constants from '../util/constants';
var env = Constants.RESERVED.ENV_DEV;
import * as os from 'os';
var cpus = {};
import {pinus} from '../pinus';

/**
 * Run all servers
 *
 * @param {Object} app current application  context
 * @return {Void}
 */
export function runServers(app)
{
    var server, servers;
    var condition = app.startId || app.type;
    switch (condition)
    {
        case Constants.RESERVED.MASTER:
            break;
        case Constants.RESERVED.ALL:
            servers = app.getServersFromConfig();
            for (var serverId in servers)
            {
                this.run(app, servers[serverId]);
            }
            break;
        default:
            server = app.getServerFromConfig(condition);
            if (!!server)
            {
                this.run(app, server);
            } else
            {
                servers = app.get(Constants.RESERVED.SERVERS)[condition];
                for (var i = 0; i < servers.length; i++)
                {
                    this.run(app, servers[i]);
                }
            }
    }
};

/**
 * Run server
 *
 * @param {Object} app current application context
 * @param {Object} server
 * @return {Void}
 */
export function run(app, server, cb)
{
    env = app.get(Constants.RESERVED.ENV);
    var cmd, key;
    if (utils.isLocal(server.host))
    {
        var options = [];
        if (!!server.args)
        {
            if (typeof server.args === 'string')
            {
                options.push(server.args.trim());
            } else
            {
                options = options.concat(server.args);
            }
        }
        cmd = app.get(Constants.RESERVED.MAIN);
        options.push(cmd);
        options.push(util.format('env=%s', env));
        for (key in server)
        {
            if (key === Constants.RESERVED.CPU)
            {
                cpus[server.id] = server[key];
            }
            options.push(util.format('%s=%s', key, server[key]));
        }
        localrun(process.execPath, null, options, cb);
    } else
    {
        cmd = util.format('cd "%s" && "%s"', app.getBase(), process.execPath);
        var arg = server.args;
        if (arg !== undefined)
        {
            cmd += arg;
        }
        cmd += util.format(' "%s" env=%s ', app.get(Constants.RESERVED.MAIN), env);
        for (key in server)
        {
            if (key === Constants.RESERVED.CPU)
            {
                cpus[server.id] = server[key];
            }
            cmd += util.format(' %s=%s ', key, server[key]);
        }
        sshrun(cmd, server.host, cb);
    }
};

/**
 * Bind process with cpu
 *
 * @param {String} sid server id
 * @param {String} pid process id
 * @param {String} host server host
 * @return {Void}
 */
export function bindCpu(sid, pid, host)
{
    if (os.platform() === Constants.PLATFORM.LINUX && cpus[sid] !== undefined)
    {
        if (utils.isLocal(host))
        {
            var options = [];
            options.push('-pc');
            options.push(cpus[sid]);
            options.push(pid);
            localrun(Constants.COMMAND.TASKSET, null, options);
        }
        else
        {
            var cmd = util.format('taskset -pc "%s" "%s"', cpus[sid], pid);
            sshrun(cmd, host, null);
        }
    }
};

/**
 * Kill application in all servers
 *
 * @param {String} pids  array of server's pid
 * @param {String} serverIds array of serverId
 */
export function kill(pids, servers)
{
    var cmd;
    for (var i = 0; i < servers.length; i++)
    {
        var server = servers[i];
        if (utils.isLocal(server.host))
        {
            var options = [];
            if (os.platform() === Constants.PLATFORM.WIN)
            {
                cmd = Constants.COMMAND.TASKKILL;
                options.push('/pid');
                options.push('/f');
            } else
            {
                cmd = Constants.COMMAND.KILL;
                options.push(-9);
            }
            options.push(pids[i]);
            localrun(cmd, null, options);
        } else
        {
            if (os.platform() === Constants.PLATFORM.WIN)
            {
                cmd = util.format('taskkill /pid %s /f', pids[i]);
            } else
            {
                cmd = util.format('kill -9 %s', pids[i]);
            }
            sshrun(cmd, server.host);
        }
    }
};

/**
 * Use ssh to run command.
 *
 * @param {String} cmd command that would be executed in the remote server
 * @param {String} host remote server host
 * @param {Function} cb callback function
 *
 */
export function sshrun(cmd, host, cb ?: Function)
{
    var args = [];
    args.push(host);
    var ssh_params = pinus.app.get(Constants.RESERVED.SSH_CONFIG_PARAMS);
    if (!!ssh_params && Array.isArray(ssh_params))
    {
        args = args.concat(ssh_params);
    }
    args.push(cmd);

    logger.info('Executing ' + cmd + ' on ' + host + ':22');
    spawnProcess(Constants.COMMAND.SSH, host, args, cb);
    return;
};

/**
 * Run local command.
 *
 * @param {String} cmd
 * @param {Callback} callback
 *
 */
export function localrun(cmd, host, options, callback ?: Function)
{
    logger.info('Executing ' + cmd + ' ' + options + ' locally');
    spawnProcess(cmd, host, options, callback);
};

/**
 * Fork child process to run command.
 *
 * @param {String} command
 * @param {Object} options
 * @param {Callback} callback
 *
 */
var spawnProcess = function (command, host, options, cb ?: Function)
{
    var child = null;

    if (env === Constants.RESERVED.ENV_DEV)
    {
        child = cp.spawn(command, options);
        var prefix = command === Constants.COMMAND.SSH ? '[' + host + '] ' : '';

        child.stderr.on('data', function (chunk)
        {
            var msg = chunk.toString();
            process.stderr.write(msg);
            if (!!cb)
            {
                cb(msg);
            }
        });

        child.stdout.on('data', function (chunk)
        {
            var msg = prefix + chunk.toString();
            process.stdout.write(msg);
        });
    } else
    {
        child = cp.spawn(command, options, { detached: true, stdio: 'inherit' });
        child.unref();
    }

    child.on('exit', function (code)
    {
        if (code !== 0)
        {
            logger.warn('child process exit with error, error code: %s, executed command: %s', code, command);
        }
        if (typeof cb === 'function')
        {
            cb(code === 0 ? null : code);
        }
    });
};
