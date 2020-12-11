#!/usr/bin/env node

import { Options } from ".";
import { TargetResolved } from "./target";

interface CommandFunc extends Function
{
	(options:Options):Promise<void>|void;
}
type Command = [string, CommandFunc];
interface Commands
{
	[key:string]:Commands|Command|undefined;
	command?:Command;
}

class UnknownCommand
{
	constructor(public cmdline:string)
	{
	}
}

const commands:Commands = {
	build: ['build', async (options:Options)=>{
		const target = await TargetResolved.fromCurrentDirectory(options);
		await target.build();
	}],
	commit:['git commit', async (options:Options)=>{
		const target = await TargetResolved.fromCurrentDirectory(options);
		if (!options.commitMessage) throw 'Need commit message';
		await target.gitCommit(options.commitMessage);
	}],
	push: ['git push', async (options:Options)=>{
		const target = await TargetResolved.fromCurrentDirectory(options);
		await target.gitPush();
	}],
};

function getCommand():[CommandFunc, Options]
{
	let cmdline = '';
	let cmds:Command|Commands|undefined = commands;
	const options:Options = {
		nobuild:false,
		x86Only:false,
		x64Only:false,
		jsOnly:false,
		ignoreNotFound:false,
	};
	const argv = process.argv;
	if (argv.length < 2)
	{
	}
	for (var i=2;i<argv.length;)
	{
		const cmd = argv[i++];
		if (cmd.startsWith('-'))
		{
			switch(cmd)
			{
			case '--nobuild': options.nobuild = true; break;
			case '--x86': options.x86Only = true; break;
			case '--x64': options.x64Only = true; break;
			case '--js': options.jsOnly = true; break;
			case '--ignore-not-found': options.ignoreNotFound = true; break;
			case '-m': 
				const value = argv[i++];
				options.commitMessage = value;
				break;
			}
		}
		else
		{
			cmdline += cmd;
			cmdline += ' ';

			if (cmd === 'command' || cmds instanceof Function)
			{
				throw new UnknownCommand(cmdline);
			}
			cmds = cmds[cmd];
			if (!cmds)
			{
				throw new UnknownCommand(cmdline);
			}
		}
	}
	if (!(cmds instanceof Array))
	{
		cmds = cmds.command;
		if (!cmds) throw new UnknownCommand(cmdline);
	}
	return [cmds[1], options];
}

(async()=>{
	const [cmd, options] = getCommand();
	await cmd(options);
})().catch(err=>{
	if (err instanceof UnknownCommand)
	{
		console.error(`Unknown command: krpm ${err.cmdline}`);
		for (const name in commands)
		{
			console.log(`krpm ${name}`);
		}
		return;
	}
	console.error(err);
});