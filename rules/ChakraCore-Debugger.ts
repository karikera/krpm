import { Target } from "..";

const target:Target = {
	name:'chakra',
	platforms: ['x86', 'x64'],
	files:[
		['lib/Jsrt', 'include', ['ChakraCommon.h', 'ChakraCore.h', 'ChakraCoreWindows.h', 'ChakraDebug.h']],
	],
	each(krb)
	{
		krb.vsbuild('ChakraCore.Debugger.sln', krb.config.name, krb.platform.shortName);
		krb.copy(
			`Build/VcBuild/bin/${krb.platform.shortName}_${krb.config.name.toLowerCase()}`,
			krb.libExportDir+'_'+krb.config.name,
			[
				'chakra.dll',
				'chakra.lib',
			]
		);
	}
};
export = target;
