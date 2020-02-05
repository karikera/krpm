import { wait, unaccess, mkdir, unaccessedFileMap, prom } from "./util";
import openGitRepo = require('simple-git');
import path = require('path');
import { promises as fs } from 'fs';
import { Target, Configuration, PlatformName, configuration, Platform, Options } from ".";
import { Build } from "./build";


function gitHandler(command:string, stdout:NodeJS.ReadableStream, stderr:NodeJS.ReadableStream)
{
	console.log(`git ${command}`);
	stdout.pipe(process.stdout);
	stderr.pipe(process.stderr);
}

export class TargetResolved implements Target
{
	readonly configurations:Configuration[];
	readonly platforms:PlatformName[];
	readonly platformBasedHeader?:boolean;
	readonly name:string;
	readonly libdir?:string;
	readonly static?:boolean;
	readonly noOwnGit?:boolean;
	readonly noOwnGitRemote?:boolean;
	readonly exportDir:string;
	readonly prebuild?:()=>Promise<void>|void;
	readonly postbuild?:()=>Promise<void>|void;
	readonly files:any[];
	readonly each:(config:Build)=>Promise<void>|void;

	constructor(target:Target, public readonly options:Options)
	{
        this.configurations = target.configurations || [configuration.debug, configuration.release];
        
        if (options.x86Only || options.x64Only || options.jsOnly)
        {		
            target.platforms = [];
            if (options.x86Only) target.platforms.push('x86');
            if (options.x64Only) target.platforms.push('x64');
            if (options.jsOnly) target.platforms.push('js');
        }
        else
        {
            this.platforms = target.platforms || ['x86', 'x64','js'];
        }
        this.platformBasedHeader = target.platformBasedHeader;
        this.name = target.name || path.basename(process.cwd());
        this.libdir = target.libdir;
        this.static = target.static;
        this.noOwnGit = target.noOwnGit;
        this.noOwnGitRemote = target.noOwnGitRemote;
        this.exportDir = '../' + this.name + '-bin';
        this.prebuild = target.prebuild;
        this.postbuild = target.postbuild;
        this.files = target.files;
        this.each = target.each;
    }
    
    async build():Promise<void>
    {
        try
        {
            console.log(`build ${this.name}`);
                
            await unaccess([this.exportDir+"/**","!"+this.exportDir+'/lib/**']);
            
            mkdir(this.exportDir);
            mkdir(this.exportDir + '/lib');

            if (this.prebuild) await this.prebuild();

            const krpm = new Build(this);
            for (const _platform of this.platforms)
            {
                krpm.setPlatform(Platform[_platform]);

                const platformDir = this.exportDir+'/lib/'+krpm.platform.shortName;
                await unaccess(platformDir);
                mkdir(platformDir);
                for (const config of this.configurations)
                {
                    // setConfig
                    krpm.setConfig(config);
                    await this.each(krpm);
                }
            }
            krpm.copy('.', this.exportDir, this.files);
            if (this.postbuild) await this.postbuild();
            const unaccessedList = [...unaccessedFileMap.values()];
            unaccessedFileMap.clear();
            for (var i=unaccessedList.length-1; i >= 0 ;i--)
            {
                const file = unaccessedList[i];
                console.log('delete '+file);
                try
                {
                    await fs.unlink(file);
                }
                catch(err)
                {
                    if ((<NodeJS.ErrnoException>err).code === 'EPERM')
                    {
                        await fs.rmdir(file);
                    }
                }
            }
            if (this.options.commitMessage)
            {
                await this.gitCommitPush(this.options.commitMessage);
            }
        }
        catch (e)
        {
            console.error(e);
        }
    }

    async gitCommitPush(commitmsg:string)
    {		
        if (!this.noOwnGit)
        {
            const srcrepo = openGitRepo('.');
            srcrepo.outputHandler(gitHandler);
            await wait<string>(cb=>srcrepo.raw(['add', '-A', '.'], cb));
            await wait(cb=>srcrepo.commit(commitmsg, cb));
            if (!this.noOwnGitRemote)
            {
                await wait(cb=>srcrepo.push('origin','master',cb));
            }
        }

        const pubrepo = openGitRepo(this.exportDir);
        pubrepo.outputHandler(gitHandler);

        await wait(cb=>pubrepo.raw(['add', '-A', '.'], cb));
        await wait(cb=>pubrepo.commit(commitmsg,cb));
        await wait(cb=>pubrepo.push('origin','master',cb));
    }

    async gitCommit(commitmsg:string)
    {		
        if (!this.noOwnGit)
        {
            const srcrepo = openGitRepo('.');
            srcrepo.outputHandler(gitHandler);
            await wait(cb=>srcrepo.raw(['add', '-A', '.'], cb));
            await wait(cb=>srcrepo.commit(commitmsg, cb));
        }

        const pubrepo = openGitRepo(this.exportDir);
        pubrepo.outputHandler(gitHandler);

        await wait(cb=>pubrepo.raw(['add', '-A', '.'], cb));
        await wait(cb=>pubrepo.commit(commitmsg, cb));
    }

    async gitPush()
    {
        if (!this.noOwnGit)
        {
            const srcrepo = openGitRepo('.');
            srcrepo.outputHandler(gitHandler);
            await wait(cb=>srcrepo.push('origin','master',cb));
        }

        const pubrepo = openGitRepo(this.exportDir);
        pubrepo.outputHandler(gitHandler);

        await wait(cb=>pubrepo.push('origin','master',cb));
    }

    static async fromCurrentDirectory(options:Options):Promise<TargetResolved>
    {
        const name = path.basename(process.cwd());
        let modulePath = path.join(__dirname, 'rules', name);
        try
        {
            await fs.stat(modulePath+'.js');
        }
        catch (err)
        {
            modulePath = path.join(process.cwd(), 'krpm.config');
            try
            {
                await fs.stat(modulePath+'.js');
            }
            catch (err)
            {
                throw `${modulePath}.js notfound`;
            }
        }
        return new TargetResolved(require(modulePath), options);
    }
    
}
