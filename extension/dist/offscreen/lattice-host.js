// Buffer polyfill for receipts/envelope.ts base64 encoding (UAT-08 fix; lattice-side
// uses Buffer.from(bytes).toString("base64") which Node provides but the offscreen
// browser context does not. INV-06 byte-freeze stays intact -- fix is build-side, not Lattice-side.
if (typeof globalThis.Buffer === "undefined") {
  globalThis.Buffer = {
    from: function (input, encoding) {
      if (typeof input === "string" && encoding === "base64") {
        var bin = atob(input);
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
      }
      if (input instanceof Uint8Array || (input && typeof input.length === "number" && typeof input !== "string")) {
        var bytes = input;
        return {
          toString: function (enc) {
            if (enc === "base64") {
              var s = "";
              for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i] & 0xFF);
              return btoa(s);
            }
            throw new Error("Buffer polyfill: unsupported toString encoding: " + enc);
          }
        };
      }
      throw new Error("Buffer polyfill: unsupported Buffer.from() input");
    }
  };
}

// node_modules/mime/dist/types/other.js
var types = {
  "application/prs.cww": ["cww"],
  "application/prs.xsf+xml": ["xsf"],
  "application/vnd.1000minds.decision-model+xml": ["1km"],
  "application/vnd.3gpp.pic-bw-large": ["plb"],
  "application/vnd.3gpp.pic-bw-small": ["psb"],
  "application/vnd.3gpp.pic-bw-var": ["pvb"],
  "application/vnd.3gpp2.tcap": ["tcap"],
  "application/vnd.3m.post-it-notes": ["pwn"],
  "application/vnd.accpac.simply.aso": ["aso"],
  "application/vnd.accpac.simply.imp": ["imp"],
  "application/vnd.acucobol": ["acu"],
  "application/vnd.acucorp": ["atc", "acutc"],
  "application/vnd.adobe.air-application-installer-package+zip": ["air"],
  "application/vnd.adobe.formscentral.fcdt": ["fcdt"],
  "application/vnd.adobe.fxp": ["fxp", "fxpl"],
  "application/vnd.adobe.xdp+xml": ["xdp"],
  "application/vnd.adobe.xfdf": ["*xfdf"],
  "application/vnd.age": ["age"],
  "application/vnd.ahead.space": ["ahead"],
  "application/vnd.airzip.filesecure.azf": ["azf"],
  "application/vnd.airzip.filesecure.azs": ["azs"],
  "application/vnd.amazon.ebook": ["azw"],
  "application/vnd.americandynamics.acc": ["acc"],
  "application/vnd.amiga.ami": ["ami"],
  "application/vnd.android.package-archive": ["apk"],
  "application/vnd.anser-web-certificate-issue-initiation": ["cii"],
  "application/vnd.anser-web-funds-transfer-initiation": ["fti"],
  "application/vnd.antix.game-component": ["atx"],
  "application/vnd.apple.installer+xml": ["mpkg"],
  "application/vnd.apple.keynote": ["key"],
  "application/vnd.apple.mpegurl": ["m3u8"],
  "application/vnd.apple.numbers": ["numbers"],
  "application/vnd.apple.pages": ["pages"],
  "application/vnd.apple.pkpass": ["pkpass"],
  "application/vnd.aristanetworks.swi": ["swi"],
  "application/vnd.astraea-software.iota": ["iota"],
  "application/vnd.audiograph": ["aep"],
  "application/vnd.autodesk.fbx": ["fbx"],
  "application/vnd.balsamiq.bmml+xml": ["bmml"],
  "application/vnd.blueice.multipass": ["mpm"],
  "application/vnd.bmi": ["bmi"],
  "application/vnd.businessobjects": ["rep"],
  "application/vnd.chemdraw+xml": ["cdxml"],
  "application/vnd.chipnuts.karaoke-mmd": ["mmd"],
  "application/vnd.cinderella": ["cdy"],
  "application/vnd.citationstyles.style+xml": ["csl"],
  "application/vnd.claymore": ["cla"],
  "application/vnd.cloanto.rp9": ["rp9"],
  "application/vnd.clonk.c4group": ["c4g", "c4d", "c4f", "c4p", "c4u"],
  "application/vnd.cluetrust.cartomobile-config": ["c11amc"],
  "application/vnd.cluetrust.cartomobile-config-pkg": ["c11amz"],
  "application/vnd.commonspace": ["csp"],
  "application/vnd.contact.cmsg": ["cdbcmsg"],
  "application/vnd.cosmocaller": ["cmc"],
  "application/vnd.crick.clicker": ["clkx"],
  "application/vnd.crick.clicker.keyboard": ["clkk"],
  "application/vnd.crick.clicker.palette": ["clkp"],
  "application/vnd.crick.clicker.template": ["clkt"],
  "application/vnd.crick.clicker.wordbank": ["clkw"],
  "application/vnd.criticaltools.wbs+xml": ["wbs"],
  "application/vnd.ctc-posml": ["pml"],
  "application/vnd.cups-ppd": ["ppd"],
  "application/vnd.curl.car": ["car"],
  "application/vnd.curl.pcurl": ["pcurl"],
  "application/vnd.dart": ["dart"],
  "application/vnd.data-vision.rdz": ["rdz"],
  "application/vnd.dbf": ["dbf"],
  "application/vnd.dcmp+xml": ["dcmp"],
  "application/vnd.dece.data": ["uvf", "uvvf", "uvd", "uvvd"],
  "application/vnd.dece.ttml+xml": ["uvt", "uvvt"],
  "application/vnd.dece.unspecified": ["uvx", "uvvx"],
  "application/vnd.dece.zip": ["uvz", "uvvz"],
  "application/vnd.denovo.fcselayout-link": ["fe_launch"],
  "application/vnd.dna": ["dna"],
  "application/vnd.dolby.mlp": ["mlp"],
  "application/vnd.dpgraph": ["dpg"],
  "application/vnd.dreamfactory": ["dfac"],
  "application/vnd.ds-keypoint": ["kpxx"],
  "application/vnd.dvb.ait": ["ait"],
  "application/vnd.dvb.service": ["svc"],
  "application/vnd.dynageo": ["geo"],
  "application/vnd.ecowin.chart": ["mag"],
  "application/vnd.enliven": ["nml"],
  "application/vnd.epson.esf": ["esf"],
  "application/vnd.epson.msf": ["msf"],
  "application/vnd.epson.quickanime": ["qam"],
  "application/vnd.epson.salt": ["slt"],
  "application/vnd.epson.ssf": ["ssf"],
  "application/vnd.eszigno3+xml": ["es3", "et3"],
  "application/vnd.ezpix-album": ["ez2"],
  "application/vnd.ezpix-package": ["ez3"],
  "application/vnd.fdf": ["*fdf"],
  "application/vnd.fdsn.mseed": ["mseed"],
  "application/vnd.fdsn.seed": ["seed", "dataless"],
  "application/vnd.flographit": ["gph"],
  "application/vnd.fluxtime.clip": ["ftc"],
  "application/vnd.framemaker": ["fm", "frame", "maker", "book"],
  "application/vnd.frogans.fnc": ["fnc"],
  "application/vnd.frogans.ltf": ["ltf"],
  "application/vnd.fsc.weblaunch": ["fsc"],
  "application/vnd.fujitsu.oasys": ["oas"],
  "application/vnd.fujitsu.oasys2": ["oa2"],
  "application/vnd.fujitsu.oasys3": ["oa3"],
  "application/vnd.fujitsu.oasysgp": ["fg5"],
  "application/vnd.fujitsu.oasysprs": ["bh2"],
  "application/vnd.fujixerox.ddd": ["ddd"],
  "application/vnd.fujixerox.docuworks": ["xdw"],
  "application/vnd.fujixerox.docuworks.binder": ["xbd"],
  "application/vnd.fuzzysheet": ["fzs"],
  "application/vnd.genomatix.tuxedo": ["txd"],
  "application/vnd.geogebra.file": ["ggb"],
  "application/vnd.geogebra.slides": ["ggs"],
  "application/vnd.geogebra.tool": ["ggt"],
  "application/vnd.geometry-explorer": ["gex", "gre"],
  "application/vnd.geonext": ["gxt"],
  "application/vnd.geoplan": ["g2w"],
  "application/vnd.geospace": ["g3w"],
  "application/vnd.gmx": ["gmx"],
  "application/vnd.google-apps.document": ["gdoc"],
  "application/vnd.google-apps.drawing": ["gdraw"],
  "application/vnd.google-apps.form": ["gform"],
  "application/vnd.google-apps.jam": ["gjam"],
  "application/vnd.google-apps.map": ["gmap"],
  "application/vnd.google-apps.presentation": ["gslides"],
  "application/vnd.google-apps.script": ["gscript"],
  "application/vnd.google-apps.site": ["gsite"],
  "application/vnd.google-apps.spreadsheet": ["gsheet"],
  "application/vnd.google-earth.kml+xml": ["kml"],
  "application/vnd.google-earth.kmz": ["kmz"],
  "application/vnd.gov.sk.xmldatacontainer+xml": ["xdcf"],
  "application/vnd.grafeq": ["gqf", "gqs"],
  "application/vnd.groove-account": ["gac"],
  "application/vnd.groove-help": ["ghf"],
  "application/vnd.groove-identity-message": ["gim"],
  "application/vnd.groove-injector": ["grv"],
  "application/vnd.groove-tool-message": ["gtm"],
  "application/vnd.groove-tool-template": ["tpl"],
  "application/vnd.groove-vcard": ["vcg"],
  "application/vnd.hal+xml": ["hal"],
  "application/vnd.handheld-entertainment+xml": ["zmm"],
  "application/vnd.hbci": ["hbci"],
  "application/vnd.hhe.lesson-player": ["les"],
  "application/vnd.hp-hpgl": ["hpgl"],
  "application/vnd.hp-hpid": ["hpid"],
  "application/vnd.hp-hps": ["hps"],
  "application/vnd.hp-jlyt": ["jlt"],
  "application/vnd.hp-pcl": ["pcl"],
  "application/vnd.hp-pclxl": ["pclxl"],
  "application/vnd.hydrostatix.sof-data": ["sfd-hdstx"],
  "application/vnd.ibm.minipay": ["mpy"],
  "application/vnd.ibm.modcap": ["afp", "listafp", "list3820"],
  "application/vnd.ibm.rights-management": ["irm"],
  "application/vnd.ibm.secure-container": ["sc"],
  "application/vnd.iccprofile": ["icc", "icm"],
  "application/vnd.igloader": ["igl"],
  "application/vnd.immervision-ivp": ["ivp"],
  "application/vnd.immervision-ivu": ["ivu"],
  "application/vnd.insors.igm": ["igm"],
  "application/vnd.intercon.formnet": ["xpw", "xpx"],
  "application/vnd.intergeo": ["i2g"],
  "application/vnd.intu.qbo": ["qbo"],
  "application/vnd.intu.qfx": ["qfx"],
  "application/vnd.ipunplugged.rcprofile": ["rcprofile"],
  "application/vnd.irepository.package+xml": ["irp"],
  "application/vnd.is-xpr": ["xpr"],
  "application/vnd.isac.fcs": ["fcs"],
  "application/vnd.jam": ["jam"],
  "application/vnd.jcp.javame.midlet-rms": ["rms"],
  "application/vnd.jisp": ["jisp"],
  "application/vnd.joost.joda-archive": ["joda"],
  "application/vnd.kahootz": ["ktz", "ktr"],
  "application/vnd.kde.karbon": ["karbon"],
  "application/vnd.kde.kchart": ["chrt"],
  "application/vnd.kde.kformula": ["kfo"],
  "application/vnd.kde.kivio": ["flw"],
  "application/vnd.kde.kontour": ["kon"],
  "application/vnd.kde.kpresenter": ["kpr", "kpt"],
  "application/vnd.kde.kspread": ["ksp"],
  "application/vnd.kde.kword": ["kwd", "kwt"],
  "application/vnd.kenameaapp": ["htke"],
  "application/vnd.kidspiration": ["kia"],
  "application/vnd.kinar": ["kne", "knp"],
  "application/vnd.koan": ["skp", "skd", "skt", "skm"],
  "application/vnd.kodak-descriptor": ["sse"],
  "application/vnd.las.las+xml": ["lasxml"],
  "application/vnd.llamagraphics.life-balance.desktop": ["lbd"],
  "application/vnd.llamagraphics.life-balance.exchange+xml": ["lbe"],
  "application/vnd.lotus-1-2-3": ["123"],
  "application/vnd.lotus-approach": ["apr"],
  "application/vnd.lotus-freelance": ["pre"],
  "application/vnd.lotus-notes": ["nsf"],
  "application/vnd.lotus-organizer": ["org"],
  "application/vnd.lotus-screencam": ["scm"],
  "application/vnd.lotus-wordpro": ["lwp"],
  "application/vnd.macports.portpkg": ["portpkg"],
  "application/vnd.mapbox-vector-tile": ["mvt"],
  "application/vnd.mcd": ["mcd"],
  "application/vnd.medcalcdata": ["mc1"],
  "application/vnd.mediastation.cdkey": ["cdkey"],
  "application/vnd.mfer": ["mwf"],
  "application/vnd.mfmp": ["mfm"],
  "application/vnd.micrografx.flo": ["flo"],
  "application/vnd.micrografx.igx": ["igx"],
  "application/vnd.mif": ["mif"],
  "application/vnd.mobius.daf": ["daf"],
  "application/vnd.mobius.dis": ["dis"],
  "application/vnd.mobius.mbk": ["mbk"],
  "application/vnd.mobius.mqy": ["mqy"],
  "application/vnd.mobius.msl": ["msl"],
  "application/vnd.mobius.plc": ["plc"],
  "application/vnd.mobius.txf": ["txf"],
  "application/vnd.mophun.application": ["mpn"],
  "application/vnd.mophun.certificate": ["mpc"],
  "application/vnd.mozilla.xul+xml": ["xul"],
  "application/vnd.ms-artgalry": ["cil"],
  "application/vnd.ms-cab-compressed": ["cab"],
  "application/vnd.ms-excel": ["xls", "xlm", "xla", "xlc", "xlt", "xlw"],
  "application/vnd.ms-excel.addin.macroenabled.12": ["xlam"],
  "application/vnd.ms-excel.sheet.binary.macroenabled.12": ["xlsb"],
  "application/vnd.ms-excel.sheet.macroenabled.12": ["xlsm"],
  "application/vnd.ms-excel.template.macroenabled.12": ["xltm"],
  "application/vnd.ms-fontobject": ["eot"],
  "application/vnd.ms-htmlhelp": ["chm"],
  "application/vnd.ms-ims": ["ims"],
  "application/vnd.ms-lrm": ["lrm"],
  "application/vnd.ms-officetheme": ["thmx"],
  "application/vnd.ms-outlook": ["msg"],
  "application/vnd.ms-pki.seccat": ["cat"],
  "application/vnd.ms-pki.stl": ["*stl"],
  "application/vnd.ms-powerpoint": ["ppt", "pps", "pot"],
  "application/vnd.ms-powerpoint.addin.macroenabled.12": ["ppam"],
  "application/vnd.ms-powerpoint.presentation.macroenabled.12": ["pptm"],
  "application/vnd.ms-powerpoint.slide.macroenabled.12": ["sldm"],
  "application/vnd.ms-powerpoint.slideshow.macroenabled.12": ["ppsm"],
  "application/vnd.ms-powerpoint.template.macroenabled.12": ["potm"],
  "application/vnd.ms-project": ["*mpp", "mpt"],
  "application/vnd.ms-visio.viewer": ["vdx"],
  "application/vnd.ms-word.document.macroenabled.12": ["docm"],
  "application/vnd.ms-word.template.macroenabled.12": ["dotm"],
  "application/vnd.ms-works": ["wps", "wks", "wcm", "wdb"],
  "application/vnd.ms-wpl": ["wpl"],
  "application/vnd.ms-xpsdocument": ["xps"],
  "application/vnd.mseq": ["mseq"],
  "application/vnd.musician": ["mus"],
  "application/vnd.muvee.style": ["msty"],
  "application/vnd.mynfc": ["taglet"],
  "application/vnd.nato.bindingdataobject+xml": ["bdo"],
  "application/vnd.neurolanguage.nlu": ["nlu"],
  "application/vnd.nitf": ["ntf", "nitf"],
  "application/vnd.noblenet-directory": ["nnd"],
  "application/vnd.noblenet-sealer": ["nns"],
  "application/vnd.noblenet-web": ["nnw"],
  "application/vnd.nokia.n-gage.ac+xml": ["*ac"],
  "application/vnd.nokia.n-gage.data": ["ngdat"],
  "application/vnd.nokia.n-gage.symbian.install": ["n-gage"],
  "application/vnd.nokia.radio-preset": ["rpst"],
  "application/vnd.nokia.radio-presets": ["rpss"],
  "application/vnd.novadigm.edm": ["edm"],
  "application/vnd.novadigm.edx": ["edx"],
  "application/vnd.novadigm.ext": ["ext"],
  "application/vnd.oasis.opendocument.chart": ["odc"],
  "application/vnd.oasis.opendocument.chart-template": ["otc"],
  "application/vnd.oasis.opendocument.database": ["odb"],
  "application/vnd.oasis.opendocument.formula": ["odf"],
  "application/vnd.oasis.opendocument.formula-template": ["odft"],
  "application/vnd.oasis.opendocument.graphics": ["odg"],
  "application/vnd.oasis.opendocument.graphics-template": ["otg"],
  "application/vnd.oasis.opendocument.image": ["odi"],
  "application/vnd.oasis.opendocument.image-template": ["oti"],
  "application/vnd.oasis.opendocument.presentation": ["odp"],
  "application/vnd.oasis.opendocument.presentation-template": ["otp"],
  "application/vnd.oasis.opendocument.spreadsheet": ["ods"],
  "application/vnd.oasis.opendocument.spreadsheet-template": ["ots"],
  "application/vnd.oasis.opendocument.text": ["odt"],
  "application/vnd.oasis.opendocument.text-master": ["odm"],
  "application/vnd.oasis.opendocument.text-template": ["ott"],
  "application/vnd.oasis.opendocument.text-web": ["oth"],
  "application/vnd.olpc-sugar": ["xo"],
  "application/vnd.oma.dd2+xml": ["dd2"],
  "application/vnd.openblox.game+xml": ["obgx"],
  "application/vnd.openofficeorg.extension": ["oxt"],
  "application/vnd.openstreetmap.data+xml": ["osm"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [
    "pptx"
  ],
  "application/vnd.openxmlformats-officedocument.presentationml.slide": [
    "sldx"
  ],
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow": [
    "ppsx"
  ],
  "application/vnd.openxmlformats-officedocument.presentationml.template": [
    "potx"
  ],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template": [
    "xltx"
  ],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    "docx"
  ],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template": [
    "dotx"
  ],
  "application/vnd.osgeo.mapguide.package": ["mgp"],
  "application/vnd.osgi.dp": ["dp"],
  "application/vnd.osgi.subsystem": ["esa"],
  "application/vnd.palm": ["pdb", "pqa", "oprc"],
  "application/vnd.pawaafile": ["paw"],
  "application/vnd.pg.format": ["str"],
  "application/vnd.pg.osasli": ["ei6"],
  "application/vnd.picsel": ["efif"],
  "application/vnd.pmi.widget": ["wg"],
  "application/vnd.pocketlearn": ["plf"],
  "application/vnd.powerbuilder6": ["pbd"],
  "application/vnd.previewsystems.box": ["box"],
  "application/vnd.procrate.brushset": ["brushset"],
  "application/vnd.procreate.brush": ["brush"],
  "application/vnd.procreate.dream": ["drm"],
  "application/vnd.proteus.magazine": ["mgz"],
  "application/vnd.publishare-delta-tree": ["qps"],
  "application/vnd.pvi.ptid1": ["ptid"],
  "application/vnd.pwg-xhtml-print+xml": ["xhtm"],
  "application/vnd.quark.quarkxpress": [
    "qxd",
    "qxt",
    "qwd",
    "qwt",
    "qxl",
    "qxb"
  ],
  "application/vnd.rar": ["rar"],
  "application/vnd.realvnc.bed": ["bed"],
  "application/vnd.recordare.musicxml": ["mxl"],
  "application/vnd.recordare.musicxml+xml": ["musicxml"],
  "application/vnd.rig.cryptonote": ["cryptonote"],
  "application/vnd.rim.cod": ["cod"],
  "application/vnd.rn-realmedia": ["rm"],
  "application/vnd.rn-realmedia-vbr": ["rmvb"],
  "application/vnd.route66.link66+xml": ["link66"],
  "application/vnd.sailingtracker.track": ["st"],
  "application/vnd.seemail": ["see"],
  "application/vnd.sema": ["sema"],
  "application/vnd.semd": ["semd"],
  "application/vnd.semf": ["semf"],
  "application/vnd.shana.informed.formdata": ["ifm"],
  "application/vnd.shana.informed.formtemplate": ["itp"],
  "application/vnd.shana.informed.interchange": ["iif"],
  "application/vnd.shana.informed.package": ["ipk"],
  "application/vnd.simtech-mindmapper": ["twd", "twds"],
  "application/vnd.smaf": ["mmf"],
  "application/vnd.smart.teacher": ["teacher"],
  "application/vnd.software602.filler.form+xml": ["fo"],
  "application/vnd.solent.sdkm+xml": ["sdkm", "sdkd"],
  "application/vnd.spotfire.dxp": ["dxp"],
  "application/vnd.spotfire.sfs": ["sfs"],
  "application/vnd.stardivision.calc": ["sdc"],
  "application/vnd.stardivision.draw": ["sda"],
  "application/vnd.stardivision.impress": ["sdd"],
  "application/vnd.stardivision.math": ["smf"],
  "application/vnd.stardivision.writer": ["sdw", "vor"],
  "application/vnd.stardivision.writer-global": ["sgl"],
  "application/vnd.stepmania.package": ["smzip"],
  "application/vnd.stepmania.stepchart": ["sm"],
  "application/vnd.sun.wadl+xml": ["wadl"],
  "application/vnd.sun.xml.calc": ["sxc"],
  "application/vnd.sun.xml.calc.template": ["stc"],
  "application/vnd.sun.xml.draw": ["sxd"],
  "application/vnd.sun.xml.draw.template": ["std"],
  "application/vnd.sun.xml.impress": ["sxi"],
  "application/vnd.sun.xml.impress.template": ["sti"],
  "application/vnd.sun.xml.math": ["sxm"],
  "application/vnd.sun.xml.writer": ["sxw"],
  "application/vnd.sun.xml.writer.global": ["sxg"],
  "application/vnd.sun.xml.writer.template": ["stw"],
  "application/vnd.sus-calendar": ["sus", "susp"],
  "application/vnd.svd": ["svd"],
  "application/vnd.symbian.install": ["sis", "sisx"],
  "application/vnd.syncml+xml": ["xsm"],
  "application/vnd.syncml.dm+wbxml": ["bdm"],
  "application/vnd.syncml.dm+xml": ["xdm"],
  "application/vnd.syncml.dmddf+xml": ["ddf"],
  "application/vnd.tao.intent-module-archive": ["tao"],
  "application/vnd.tcpdump.pcap": ["pcap", "cap", "dmp"],
  "application/vnd.tmobile-livetv": ["tmo"],
  "application/vnd.trid.tpt": ["tpt"],
  "application/vnd.triscape.mxs": ["mxs"],
  "application/vnd.trueapp": ["tra"],
  "application/vnd.ufdl": ["ufd", "ufdl"],
  "application/vnd.uiq.theme": ["utz"],
  "application/vnd.umajin": ["umj"],
  "application/vnd.unity": ["unityweb"],
  "application/vnd.uoml+xml": ["uoml", "uo"],
  "application/vnd.vcx": ["vcx"],
  "application/vnd.visio": ["vsd", "vst", "vss", "vsw", "vsdx", "vtx"],
  "application/vnd.visionary": ["vis"],
  "application/vnd.vsf": ["vsf"],
  "application/vnd.wap.wbxml": ["wbxml"],
  "application/vnd.wap.wmlc": ["wmlc"],
  "application/vnd.wap.wmlscriptc": ["wmlsc"],
  "application/vnd.webturbo": ["wtb"],
  "application/vnd.wolfram.player": ["nbp"],
  "application/vnd.wordperfect": ["wpd"],
  "application/vnd.wqd": ["wqd"],
  "application/vnd.wt.stf": ["stf"],
  "application/vnd.xara": ["xar"],
  "application/vnd.xfdl": ["xfdl"],
  "application/vnd.yamaha.hv-dic": ["hvd"],
  "application/vnd.yamaha.hv-script": ["hvs"],
  "application/vnd.yamaha.hv-voice": ["hvp"],
  "application/vnd.yamaha.openscoreformat": ["osf"],
  "application/vnd.yamaha.openscoreformat.osfpvg+xml": ["osfpvg"],
  "application/vnd.yamaha.smaf-audio": ["saf"],
  "application/vnd.yamaha.smaf-phrase": ["spf"],
  "application/vnd.yellowriver-custom-menu": ["cmp"],
  "application/vnd.zul": ["zir", "zirz"],
  "application/vnd.zzazz.deck+xml": ["zaz"],
  "application/x-7z-compressed": ["7z"],
  "application/x-abiword": ["abw"],
  "application/x-ace-compressed": ["ace"],
  "application/x-apple-diskimage": ["*dmg"],
  "application/x-arj": ["arj"],
  "application/x-authorware-bin": ["aab", "x32", "u32", "vox"],
  "application/x-authorware-map": ["aam"],
  "application/x-authorware-seg": ["aas"],
  "application/x-bcpio": ["bcpio"],
  "application/x-bdoc": ["*bdoc"],
  "application/x-bittorrent": ["torrent"],
  "application/x-blender": ["blend"],
  "application/x-blorb": ["blb", "blorb"],
  "application/x-bzip": ["bz"],
  "application/x-bzip2": ["bz2", "boz"],
  "application/x-cbr": ["cbr", "cba", "cbt", "cbz", "cb7"],
  "application/x-cdlink": ["vcd"],
  "application/x-cfs-compressed": ["cfs"],
  "application/x-chat": ["chat"],
  "application/x-chess-pgn": ["pgn"],
  "application/x-chrome-extension": ["crx"],
  "application/x-cocoa": ["cco"],
  "application/x-compressed": ["*rar"],
  "application/x-conference": ["nsc"],
  "application/x-cpio": ["cpio"],
  "application/x-csh": ["csh"],
  "application/x-debian-package": ["*deb", "udeb"],
  "application/x-dgc-compressed": ["dgc"],
  "application/x-director": [
    "dir",
    "dcr",
    "dxr",
    "cst",
    "cct",
    "cxt",
    "w3d",
    "fgd",
    "swa"
  ],
  "application/x-doom": ["wad"],
  "application/x-dtbncx+xml": ["ncx"],
  "application/x-dtbook+xml": ["dtb"],
  "application/x-dtbresource+xml": ["res"],
  "application/x-dvi": ["dvi"],
  "application/x-envoy": ["evy"],
  "application/x-eva": ["eva"],
  "application/x-font-bdf": ["bdf"],
  "application/x-font-ghostscript": ["gsf"],
  "application/x-font-linux-psf": ["psf"],
  "application/x-font-pcf": ["pcf"],
  "application/x-font-snf": ["snf"],
  "application/x-font-type1": ["pfa", "pfb", "pfm", "afm"],
  "application/x-freearc": ["arc"],
  "application/x-futuresplash": ["spl"],
  "application/x-gca-compressed": ["gca"],
  "application/x-glulx": ["ulx"],
  "application/x-gnumeric": ["gnumeric"],
  "application/x-gramps-xml": ["gramps"],
  "application/x-gtar": ["gtar"],
  "application/x-hdf": ["hdf"],
  "application/x-httpd-php": ["php"],
  "application/x-install-instructions": ["install"],
  "application/x-ipynb+json": ["ipynb"],
  "application/x-iso9660-image": ["*iso"],
  "application/x-iwork-keynote-sffkey": ["*key"],
  "application/x-iwork-numbers-sffnumbers": ["*numbers"],
  "application/x-iwork-pages-sffpages": ["*pages"],
  "application/x-java-archive-diff": ["jardiff"],
  "application/x-java-jnlp-file": ["jnlp"],
  "application/x-keepass2": ["kdbx"],
  "application/x-latex": ["latex"],
  "application/x-lua-bytecode": ["luac"],
  "application/x-lzh-compressed": ["lzh", "lha"],
  "application/x-makeself": ["run"],
  "application/x-mie": ["mie"],
  "application/x-mobipocket-ebook": ["*prc", "mobi"],
  "application/x-ms-application": ["application"],
  "application/x-ms-shortcut": ["lnk"],
  "application/x-ms-wmd": ["wmd"],
  "application/x-ms-wmz": ["wmz"],
  "application/x-ms-xbap": ["xbap"],
  "application/x-msaccess": ["mdb"],
  "application/x-msbinder": ["obd"],
  "application/x-mscardfile": ["crd"],
  "application/x-msclip": ["clp"],
  "application/x-msdos-program": ["*exe"],
  "application/x-msdownload": ["*exe", "*dll", "com", "bat", "*msi"],
  "application/x-msmediaview": ["mvb", "m13", "m14"],
  "application/x-msmetafile": ["*wmf", "*wmz", "*emf", "emz"],
  "application/x-msmoney": ["mny"],
  "application/x-mspublisher": ["pub"],
  "application/x-msschedule": ["scd"],
  "application/x-msterminal": ["trm"],
  "application/x-mswrite": ["wri"],
  "application/x-netcdf": ["nc", "cdf"],
  "application/x-ns-proxy-autoconfig": ["pac"],
  "application/x-nzb": ["nzb"],
  "application/x-perl": ["pl", "pm"],
  "application/x-pilot": ["*prc", "*pdb"],
  "application/x-pkcs12": ["p12", "pfx"],
  "application/x-pkcs7-certificates": ["p7b", "spc"],
  "application/x-pkcs7-certreqresp": ["p7r"],
  "application/x-rar-compressed": ["*rar"],
  "application/x-redhat-package-manager": ["rpm"],
  "application/x-research-info-systems": ["ris"],
  "application/x-sea": ["sea"],
  "application/x-sh": ["sh"],
  "application/x-shar": ["shar"],
  "application/x-shockwave-flash": ["swf"],
  "application/x-silverlight-app": ["xap"],
  "application/x-sql": ["*sql"],
  "application/x-stuffit": ["sit"],
  "application/x-stuffitx": ["sitx"],
  "application/x-subrip": ["srt"],
  "application/x-sv4cpio": ["sv4cpio"],
  "application/x-sv4crc": ["sv4crc"],
  "application/x-t3vm-image": ["t3"],
  "application/x-tads": ["gam"],
  "application/x-tar": ["tar"],
  "application/x-tcl": ["tcl", "tk"],
  "application/x-tex": ["tex"],
  "application/x-tex-tfm": ["tfm"],
  "application/x-texinfo": ["texinfo", "texi"],
  "application/x-tgif": ["*obj"],
  "application/x-ustar": ["ustar"],
  "application/x-virtualbox-hdd": ["hdd"],
  "application/x-virtualbox-ova": ["ova"],
  "application/x-virtualbox-ovf": ["ovf"],
  "application/x-virtualbox-vbox": ["vbox"],
  "application/x-virtualbox-vbox-extpack": ["vbox-extpack"],
  "application/x-virtualbox-vdi": ["vdi"],
  "application/x-virtualbox-vhd": ["vhd"],
  "application/x-virtualbox-vmdk": ["vmdk"],
  "application/x-wais-source": ["src"],
  "application/x-web-app-manifest+json": ["webapp"],
  "application/x-x509-ca-cert": ["der", "crt", "pem"],
  "application/x-xfig": ["fig"],
  "application/x-xliff+xml": ["*xlf"],
  "application/x-xpinstall": ["xpi"],
  "application/x-xz": ["xz"],
  "application/x-zip-compressed": ["*zip"],
  "application/x-zmachine": ["z1", "z2", "z3", "z4", "z5", "z6", "z7", "z8"],
  "audio/vnd.dece.audio": ["uva", "uvva"],
  "audio/vnd.digital-winds": ["eol"],
  "audio/vnd.dra": ["dra"],
  "audio/vnd.dts": ["dts"],
  "audio/vnd.dts.hd": ["dtshd"],
  "audio/vnd.lucent.voice": ["lvp"],
  "audio/vnd.ms-playready.media.pya": ["pya"],
  "audio/vnd.nuera.ecelp4800": ["ecelp4800"],
  "audio/vnd.nuera.ecelp7470": ["ecelp7470"],
  "audio/vnd.nuera.ecelp9600": ["ecelp9600"],
  "audio/vnd.rip": ["rip"],
  "audio/x-aac": ["*aac"],
  "audio/x-aiff": ["aif", "aiff", "aifc"],
  "audio/x-caf": ["caf"],
  "audio/x-flac": ["flac"],
  "audio/x-m4a": ["*m4a"],
  "audio/x-matroska": ["mka"],
  "audio/x-mpegurl": ["m3u"],
  "audio/x-ms-wax": ["wax"],
  "audio/x-ms-wma": ["wma"],
  "audio/x-pn-realaudio": ["ram", "ra"],
  "audio/x-pn-realaudio-plugin": ["rmp"],
  "audio/x-realaudio": ["*ra"],
  "audio/x-wav": ["*wav"],
  "chemical/x-cdx": ["cdx"],
  "chemical/x-cif": ["cif"],
  "chemical/x-cmdf": ["cmdf"],
  "chemical/x-cml": ["cml"],
  "chemical/x-csml": ["csml"],
  "chemical/x-xyz": ["xyz"],
  "image/prs.btif": ["btif", "btf"],
  "image/prs.pti": ["pti"],
  "image/vnd.adobe.photoshop": ["psd"],
  "image/vnd.airzip.accelerator.azv": ["azv"],
  "image/vnd.blockfact.facti": ["facti"],
  "image/vnd.dece.graphic": ["uvi", "uvvi", "uvg", "uvvg"],
  "image/vnd.djvu": ["djvu", "djv"],
  "image/vnd.dvb.subtitle": ["*sub"],
  "image/vnd.dwg": ["dwg"],
  "image/vnd.dxf": ["dxf"],
  "image/vnd.fastbidsheet": ["fbs"],
  "image/vnd.fpx": ["fpx"],
  "image/vnd.fst": ["fst"],
  "image/vnd.fujixerox.edmics-mmr": ["mmr"],
  "image/vnd.fujixerox.edmics-rlc": ["rlc"],
  "image/vnd.microsoft.icon": ["ico"],
  "image/vnd.ms-dds": ["dds"],
  "image/vnd.ms-modi": ["mdi"],
  "image/vnd.ms-photo": ["wdp"],
  "image/vnd.net-fpx": ["npx"],
  "image/vnd.pco.b16": ["b16"],
  "image/vnd.tencent.tap": ["tap"],
  "image/vnd.valve.source.texture": ["vtf"],
  "image/vnd.wap.wbmp": ["wbmp"],
  "image/vnd.xiff": ["xif"],
  "image/vnd.zbrush.pcx": ["pcx"],
  "image/x-3ds": ["3ds"],
  "image/x-adobe-dng": ["dng"],
  "image/x-cmu-raster": ["ras"],
  "image/x-cmx": ["cmx"],
  "image/x-freehand": ["fh", "fhc", "fh4", "fh5", "fh7"],
  "image/x-icon": ["*ico"],
  "image/x-jng": ["jng"],
  "image/x-mrsid-image": ["sid"],
  "image/x-ms-bmp": ["*bmp"],
  "image/x-pcx": ["*pcx"],
  "image/x-pict": ["pic", "pct"],
  "image/x-portable-anymap": ["pnm"],
  "image/x-portable-bitmap": ["pbm"],
  "image/x-portable-graymap": ["pgm"],
  "image/x-portable-pixmap": ["ppm"],
  "image/x-rgb": ["rgb"],
  "image/x-tga": ["tga"],
  "image/x-xbitmap": ["xbm"],
  "image/x-xpixmap": ["xpm"],
  "image/x-xwindowdump": ["xwd"],
  "message/vnd.wfa.wsc": ["wsc"],
  "model/vnd.bary": ["bary"],
  "model/vnd.cld": ["cld"],
  "model/vnd.collada+xml": ["dae"],
  "model/vnd.dwf": ["dwf"],
  "model/vnd.gdl": ["gdl"],
  "model/vnd.gtw": ["gtw"],
  "model/vnd.mts": ["*mts"],
  "model/vnd.opengex": ["ogex"],
  "model/vnd.parasolid.transmit.binary": ["x_b"],
  "model/vnd.parasolid.transmit.text": ["x_t"],
  "model/vnd.pytha.pyox": ["pyo", "pyox"],
  "model/vnd.sap.vds": ["vds"],
  "model/vnd.usda": ["usda"],
  "model/vnd.usdz+zip": ["usdz"],
  "model/vnd.valve.source.compiled-map": ["bsp"],
  "model/vnd.vtu": ["vtu"],
  "text/prs.lines.tag": ["dsc"],
  "text/vnd.curl": ["curl"],
  "text/vnd.curl.dcurl": ["dcurl"],
  "text/vnd.curl.mcurl": ["mcurl"],
  "text/vnd.curl.scurl": ["scurl"],
  "text/vnd.dvb.subtitle": ["sub"],
  "text/vnd.familysearch.gedcom": ["ged"],
  "text/vnd.fly": ["fly"],
  "text/vnd.fmi.flexstor": ["flx"],
  "text/vnd.graphviz": ["gv"],
  "text/vnd.in3d.3dml": ["3dml"],
  "text/vnd.in3d.spot": ["spot"],
  "text/vnd.sun.j2me.app-descriptor": ["jad"],
  "text/vnd.wap.wml": ["wml"],
  "text/vnd.wap.wmlscript": ["wmls"],
  "text/x-asm": ["s", "asm"],
  "text/x-c": ["c", "cc", "cxx", "cpp", "h", "hh", "dic"],
  "text/x-component": ["htc"],
  "text/x-fortran": ["f", "for", "f77", "f90"],
  "text/x-handlebars-template": ["hbs"],
  "text/x-java-source": ["java"],
  "text/x-lua": ["lua"],
  "text/x-markdown": ["mkd"],
  "text/x-nfo": ["nfo"],
  "text/x-opml": ["opml"],
  "text/x-org": ["*org"],
  "text/x-pascal": ["p", "pas"],
  "text/x-processing": ["pde"],
  "text/x-sass": ["sass"],
  "text/x-scss": ["scss"],
  "text/x-setext": ["etx"],
  "text/x-sfv": ["sfv"],
  "text/x-suse-ymp": ["ymp"],
  "text/x-uuencode": ["uu"],
  "text/x-vcalendar": ["vcs"],
  "text/x-vcard": ["vcf"],
  "video/vnd.dece.hd": ["uvh", "uvvh"],
  "video/vnd.dece.mobile": ["uvm", "uvvm"],
  "video/vnd.dece.pd": ["uvp", "uvvp"],
  "video/vnd.dece.sd": ["uvs", "uvvs"],
  "video/vnd.dece.video": ["uvv", "uvvv"],
  "video/vnd.dvb.file": ["dvb"],
  "video/vnd.fvt": ["fvt"],
  "video/vnd.mpegurl": ["mxu", "m4u"],
  "video/vnd.ms-playready.media.pyv": ["pyv"],
  "video/vnd.uvvu.mp4": ["uvu", "uvvu"],
  "video/vnd.vivo": ["viv"],
  "video/x-f4v": ["f4v"],
  "video/x-fli": ["fli"],
  "video/x-flv": ["flv"],
  "video/x-m4v": ["m4v"],
  "video/x-matroska": ["mkv", "mk3d", "mks"],
  "video/x-mng": ["mng"],
  "video/x-ms-asf": ["asf", "asx"],
  "video/x-ms-vob": ["vob"],
  "video/x-ms-wm": ["wm"],
  "video/x-ms-wmv": ["wmv"],
  "video/x-ms-wmx": ["wmx"],
  "video/x-ms-wvx": ["wvx"],
  "video/x-msvideo": ["avi"],
  "video/x-sgi-movie": ["movie"],
  "video/x-smv": ["smv"],
  "x-conference/x-cooltalk": ["ice"]
};
Object.freeze(types);
var other_default = types;

// node_modules/mime/dist/types/standard.js
var types2 = {
  "application/andrew-inset": ["ez"],
  "application/appinstaller": ["appinstaller"],
  "application/applixware": ["aw"],
  "application/appx": ["appx"],
  "application/appxbundle": ["appxbundle"],
  "application/atom+xml": ["atom"],
  "application/atomcat+xml": ["atomcat"],
  "application/atomdeleted+xml": ["atomdeleted"],
  "application/atomsvc+xml": ["atomsvc"],
  "application/atsc-dwd+xml": ["dwd"],
  "application/atsc-held+xml": ["held"],
  "application/atsc-rsat+xml": ["rsat"],
  "application/automationml-aml+xml": ["aml"],
  "application/automationml-amlx+zip": ["amlx"],
  "application/bdoc": ["bdoc"],
  "application/calendar+xml": ["xcs"],
  "application/ccxml+xml": ["ccxml"],
  "application/cdfx+xml": ["cdfx"],
  "application/cdmi-capability": ["cdmia"],
  "application/cdmi-container": ["cdmic"],
  "application/cdmi-domain": ["cdmid"],
  "application/cdmi-object": ["cdmio"],
  "application/cdmi-queue": ["cdmiq"],
  "application/cpl+xml": ["cpl"],
  "application/cu-seeme": ["cu"],
  "application/cwl": ["cwl"],
  "application/dash+xml": ["mpd"],
  "application/dash-patch+xml": ["mpp"],
  "application/davmount+xml": ["davmount"],
  "application/dicom": ["dcm"],
  "application/docbook+xml": ["dbk"],
  "application/dssc+der": ["dssc"],
  "application/dssc+xml": ["xdssc"],
  "application/ecmascript": ["ecma"],
  "application/emma+xml": ["emma"],
  "application/emotionml+xml": ["emotionml"],
  "application/epub+zip": ["epub"],
  "application/exi": ["exi"],
  "application/express": ["exp"],
  "application/fdf": ["fdf"],
  "application/fdt+xml": ["fdt"],
  "application/font-tdpfr": ["pfr"],
  "application/geo+json": ["geojson"],
  "application/gml+xml": ["gml"],
  "application/gpx+xml": ["gpx"],
  "application/gxf": ["gxf"],
  "application/gzip": ["gz"],
  "application/hjson": ["hjson"],
  "application/hyperstudio": ["stk"],
  "application/inkml+xml": ["ink", "inkml"],
  "application/ipfix": ["ipfix"],
  "application/its+xml": ["its"],
  "application/java-archive": ["jar", "war", "ear"],
  "application/java-serialized-object": ["ser"],
  "application/java-vm": ["class"],
  "application/javascript": ["*js"],
  "application/json": ["json", "map"],
  "application/json5": ["json5"],
  "application/jsonml+json": ["jsonml"],
  "application/ld+json": ["jsonld"],
  "application/lgr+xml": ["lgr"],
  "application/lost+xml": ["lostxml"],
  "application/mac-binhex40": ["hqx"],
  "application/mac-compactpro": ["cpt"],
  "application/mads+xml": ["mads"],
  "application/manifest+json": ["webmanifest"],
  "application/marc": ["mrc"],
  "application/marcxml+xml": ["mrcx"],
  "application/mathematica": ["ma", "nb", "mb"],
  "application/mathml+xml": ["mathml"],
  "application/mbox": ["mbox"],
  "application/media-policy-dataset+xml": ["mpf"],
  "application/mediaservercontrol+xml": ["mscml"],
  "application/metalink+xml": ["metalink"],
  "application/metalink4+xml": ["meta4"],
  "application/mets+xml": ["mets"],
  "application/mmt-aei+xml": ["maei"],
  "application/mmt-usd+xml": ["musd"],
  "application/mods+xml": ["mods"],
  "application/mp21": ["m21", "mp21"],
  "application/mp4": ["*mp4", "*mpg4", "mp4s", "m4p"],
  "application/msix": ["msix"],
  "application/msixbundle": ["msixbundle"],
  "application/msword": ["doc", "dot"],
  "application/mxf": ["mxf"],
  "application/n-quads": ["nq"],
  "application/n-triples": ["nt"],
  "application/node": ["cjs"],
  "application/octet-stream": [
    "bin",
    "dms",
    "lrf",
    "mar",
    "so",
    "dist",
    "distz",
    "pkg",
    "bpk",
    "dump",
    "elc",
    "deploy",
    "exe",
    "dll",
    "deb",
    "dmg",
    "iso",
    "img",
    "msi",
    "msp",
    "msm",
    "buffer"
  ],
  "application/oda": ["oda"],
  "application/oebps-package+xml": ["opf"],
  "application/ogg": ["ogx"],
  "application/omdoc+xml": ["omdoc"],
  "application/onenote": [
    "onetoc",
    "onetoc2",
    "onetmp",
    "onepkg",
    "one",
    "onea"
  ],
  "application/oxps": ["oxps"],
  "application/p2p-overlay+xml": ["relo"],
  "application/patch-ops-error+xml": ["xer"],
  "application/pdf": ["pdf"],
  "application/pgp-encrypted": ["pgp"],
  "application/pgp-keys": ["asc"],
  "application/pgp-signature": ["sig", "*asc"],
  "application/pics-rules": ["prf"],
  "application/pkcs10": ["p10"],
  "application/pkcs7-mime": ["p7m", "p7c"],
  "application/pkcs7-signature": ["p7s"],
  "application/pkcs8": ["p8"],
  "application/pkix-attr-cert": ["ac"],
  "application/pkix-cert": ["cer"],
  "application/pkix-crl": ["crl"],
  "application/pkix-pkipath": ["pkipath"],
  "application/pkixcmp": ["pki"],
  "application/pls+xml": ["pls"],
  "application/postscript": ["ai", "eps", "ps"],
  "application/provenance+xml": ["provx"],
  "application/pskc+xml": ["pskcxml"],
  "application/raml+yaml": ["raml"],
  "application/rdf+xml": ["rdf", "owl"],
  "application/reginfo+xml": ["rif"],
  "application/relax-ng-compact-syntax": ["rnc"],
  "application/resource-lists+xml": ["rl"],
  "application/resource-lists-diff+xml": ["rld"],
  "application/rls-services+xml": ["rs"],
  "application/route-apd+xml": ["rapd"],
  "application/route-s-tsid+xml": ["sls"],
  "application/route-usd+xml": ["rusd"],
  "application/rpki-ghostbusters": ["gbr"],
  "application/rpki-manifest": ["mft"],
  "application/rpki-roa": ["roa"],
  "application/rsd+xml": ["rsd"],
  "application/rss+xml": ["rss"],
  "application/rtf": ["rtf"],
  "application/sbml+xml": ["sbml"],
  "application/scvp-cv-request": ["scq"],
  "application/scvp-cv-response": ["scs"],
  "application/scvp-vp-request": ["spq"],
  "application/scvp-vp-response": ["spp"],
  "application/sdp": ["sdp"],
  "application/senml+xml": ["senmlx"],
  "application/sensml+xml": ["sensmlx"],
  "application/set-payment-initiation": ["setpay"],
  "application/set-registration-initiation": ["setreg"],
  "application/shf+xml": ["shf"],
  "application/sieve": ["siv", "sieve"],
  "application/smil+xml": ["smi", "smil"],
  "application/sparql-query": ["rq"],
  "application/sparql-results+xml": ["srx"],
  "application/sql": ["sql"],
  "application/srgs": ["gram"],
  "application/srgs+xml": ["grxml"],
  "application/sru+xml": ["sru"],
  "application/ssdl+xml": ["ssdl"],
  "application/ssml+xml": ["ssml"],
  "application/swid+xml": ["swidtag"],
  "application/tei+xml": ["tei", "teicorpus"],
  "application/thraud+xml": ["tfi"],
  "application/timestamped-data": ["tsd"],
  "application/toml": ["toml"],
  "application/trig": ["trig"],
  "application/ttml+xml": ["ttml"],
  "application/ubjson": ["ubj"],
  "application/urc-ressheet+xml": ["rsheet"],
  "application/urc-targetdesc+xml": ["td"],
  "application/voicexml+xml": ["vxml"],
  "application/wasm": ["wasm"],
  "application/watcherinfo+xml": ["wif"],
  "application/widget": ["wgt"],
  "application/winhlp": ["hlp"],
  "application/wsdl+xml": ["wsdl"],
  "application/wspolicy+xml": ["wspolicy"],
  "application/xaml+xml": ["xaml"],
  "application/xcap-att+xml": ["xav"],
  "application/xcap-caps+xml": ["xca"],
  "application/xcap-diff+xml": ["xdf"],
  "application/xcap-el+xml": ["xel"],
  "application/xcap-ns+xml": ["xns"],
  "application/xenc+xml": ["xenc"],
  "application/xfdf": ["xfdf"],
  "application/xhtml+xml": ["xhtml", "xht"],
  "application/xliff+xml": ["xlf"],
  "application/xml": ["xml", "xsl", "xsd", "rng"],
  "application/xml-dtd": ["dtd"],
  "application/xop+xml": ["xop"],
  "application/xproc+xml": ["xpl"],
  "application/xslt+xml": ["*xsl", "xslt"],
  "application/xspf+xml": ["xspf"],
  "application/xv+xml": ["mxml", "xhvml", "xvml", "xvm"],
  "application/yang": ["yang"],
  "application/yin+xml": ["yin"],
  "application/zip": ["zip"],
  "application/zip+dotlottie": ["lottie"],
  "audio/3gpp": ["*3gpp"],
  "audio/aac": ["adts", "aac"],
  "audio/adpcm": ["adp"],
  "audio/amr": ["amr"],
  "audio/basic": ["au", "snd"],
  "audio/midi": ["mid", "midi", "kar", "rmi"],
  "audio/mobile-xmf": ["mxmf"],
  "audio/mp3": ["*mp3"],
  "audio/mp4": ["m4a", "mp4a", "m4b"],
  "audio/mpeg": ["mpga", "mp2", "mp2a", "mp3", "m2a", "m3a"],
  "audio/ogg": ["oga", "ogg", "spx", "opus"],
  "audio/s3m": ["s3m"],
  "audio/silk": ["sil"],
  "audio/wav": ["wav"],
  "audio/wave": ["*wav"],
  "audio/webm": ["weba"],
  "audio/xm": ["xm"],
  "font/collection": ["ttc"],
  "font/otf": ["otf"],
  "font/ttf": ["ttf"],
  "font/woff": ["woff"],
  "font/woff2": ["woff2"],
  "image/aces": ["exr"],
  "image/apng": ["apng"],
  "image/avci": ["avci"],
  "image/avcs": ["avcs"],
  "image/avif": ["avif"],
  "image/bmp": ["bmp", "dib"],
  "image/cgm": ["cgm"],
  "image/dicom-rle": ["drle"],
  "image/dpx": ["dpx"],
  "image/emf": ["emf"],
  "image/fits": ["fits"],
  "image/g3fax": ["g3"],
  "image/gif": ["gif"],
  "image/heic": ["heic"],
  "image/heic-sequence": ["heics"],
  "image/heif": ["heif"],
  "image/heif-sequence": ["heifs"],
  "image/hej2k": ["hej2"],
  "image/ief": ["ief"],
  "image/jaii": ["jaii"],
  "image/jais": ["jais"],
  "image/jls": ["jls"],
  "image/jp2": ["jp2", "jpg2"],
  "image/jpeg": ["jpg", "jpeg", "jpe"],
  "image/jph": ["jph"],
  "image/jphc": ["jhc"],
  "image/jpm": ["jpm", "jpgm"],
  "image/jpx": ["jpx", "jpf"],
  "image/jxl": ["jxl"],
  "image/jxr": ["jxr"],
  "image/jxra": ["jxra"],
  "image/jxrs": ["jxrs"],
  "image/jxs": ["jxs"],
  "image/jxsc": ["jxsc"],
  "image/jxsi": ["jxsi"],
  "image/jxss": ["jxss"],
  "image/ktx": ["ktx"],
  "image/ktx2": ["ktx2"],
  "image/pjpeg": ["jfif"],
  "image/png": ["png"],
  "image/sgi": ["sgi"],
  "image/svg+xml": ["svg", "svgz"],
  "image/t38": ["t38"],
  "image/tiff": ["tif", "tiff"],
  "image/tiff-fx": ["tfx"],
  "image/webp": ["webp"],
  "image/wmf": ["wmf"],
  "message/disposition-notification": ["disposition-notification"],
  "message/global": ["u8msg"],
  "message/global-delivery-status": ["u8dsn"],
  "message/global-disposition-notification": ["u8mdn"],
  "message/global-headers": ["u8hdr"],
  "message/rfc822": ["eml", "mime", "mht", "mhtml"],
  "model/3mf": ["3mf"],
  "model/gltf+json": ["gltf"],
  "model/gltf-binary": ["glb"],
  "model/iges": ["igs", "iges"],
  "model/jt": ["jt"],
  "model/mesh": ["msh", "mesh", "silo"],
  "model/mtl": ["mtl"],
  "model/obj": ["obj"],
  "model/prc": ["prc"],
  "model/step": ["step", "stp", "stpnc", "p21", "210"],
  "model/step+xml": ["stpx"],
  "model/step+zip": ["stpz"],
  "model/step-xml+zip": ["stpxz"],
  "model/stl": ["stl"],
  "model/u3d": ["u3d"],
  "model/vrml": ["wrl", "vrml"],
  "model/x3d+binary": ["*x3db", "x3dbz"],
  "model/x3d+fastinfoset": ["x3db"],
  "model/x3d+vrml": ["*x3dv", "x3dvz"],
  "model/x3d+xml": ["x3d", "x3dz"],
  "model/x3d-vrml": ["x3dv"],
  "text/cache-manifest": ["appcache", "manifest"],
  "text/calendar": ["ics", "ifb"],
  "text/coffeescript": ["coffee", "litcoffee"],
  "text/css": ["css"],
  "text/csv": ["csv"],
  "text/html": ["html", "htm", "shtml"],
  "text/jade": ["jade"],
  "text/javascript": ["js", "mjs"],
  "text/jsx": ["jsx"],
  "text/less": ["less"],
  "text/markdown": ["md", "markdown"],
  "text/mathml": ["mml"],
  "text/mdx": ["mdx"],
  "text/n3": ["n3"],
  "text/plain": ["txt", "text", "conf", "def", "list", "log", "in", "ini"],
  "text/richtext": ["rtx"],
  "text/rtf": ["*rtf"],
  "text/sgml": ["sgml", "sgm"],
  "text/shex": ["shex"],
  "text/slim": ["slim", "slm"],
  "text/spdx": ["spdx"],
  "text/stylus": ["stylus", "styl"],
  "text/tab-separated-values": ["tsv"],
  "text/troff": ["t", "tr", "roff", "man", "me", "ms"],
  "text/turtle": ["ttl"],
  "text/uri-list": ["uri", "uris", "urls"],
  "text/vcard": ["vcard"],
  "text/vtt": ["vtt"],
  "text/wgsl": ["wgsl"],
  "text/xml": ["*xml"],
  "text/yaml": ["yaml", "yml"],
  "video/3gpp": ["3gp", "3gpp"],
  "video/3gpp2": ["3g2"],
  "video/h261": ["h261"],
  "video/h263": ["h263"],
  "video/h264": ["h264"],
  "video/iso.segment": ["m4s"],
  "video/jpeg": ["jpgv"],
  "video/jpm": ["*jpm", "*jpgm"],
  "video/mj2": ["mj2", "mjp2"],
  "video/mp2t": ["ts", "m2t", "m2ts", "mts"],
  "video/mp4": ["mp4", "mp4v", "mpg4"],
  "video/mpeg": ["mpeg", "mpg", "mpe", "m1v", "m2v"],
  "video/ogg": ["ogv"],
  "video/quicktime": ["qt", "mov"],
  "video/webm": ["webm"]
};
Object.freeze(types2);
var standard_default = types2;

// node_modules/mime/dist/src/Mime.js
var __classPrivateFieldGet = function(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _Mime_extensionToType;
var _Mime_typeToExtension;
var _Mime_typeToExtensions;
var Mime = class {
  constructor(...args) {
    _Mime_extensionToType.set(this, /* @__PURE__ */ new Map());
    _Mime_typeToExtension.set(this, /* @__PURE__ */ new Map());
    _Mime_typeToExtensions.set(this, /* @__PURE__ */ new Map());
    for (const arg of args) {
      this.define(arg);
    }
  }
  define(typeMap, force = false) {
    for (let [type, extensions] of Object.entries(typeMap)) {
      type = type.toLowerCase();
      extensions = extensions.map((ext) => ext.toLowerCase());
      if (!__classPrivateFieldGet(this, _Mime_typeToExtensions, "f").has(type)) {
        __classPrivateFieldGet(this, _Mime_typeToExtensions, "f").set(type, /* @__PURE__ */ new Set());
      }
      const allExtensions = __classPrivateFieldGet(this, _Mime_typeToExtensions, "f").get(type);
      let first = true;
      for (let extension of extensions) {
        const starred = extension.startsWith("*");
        extension = starred ? extension.slice(1) : extension;
        allExtensions?.add(extension);
        if (first) {
          __classPrivateFieldGet(this, _Mime_typeToExtension, "f").set(type, extension);
        }
        first = false;
        if (starred)
          continue;
        const currentType = __classPrivateFieldGet(this, _Mime_extensionToType, "f").get(extension);
        if (currentType && currentType != type && !force) {
          throw new Error(`"${type} -> ${extension}" conflicts with "${currentType} -> ${extension}". Pass \`force=true\` to override this definition.`);
        }
        __classPrivateFieldGet(this, _Mime_extensionToType, "f").set(extension, type);
      }
    }
    return this;
  }
  getType(path) {
    if (typeof path !== "string")
      return null;
    const last = path.replace(/^.*[/\\]/s, "").toLowerCase();
    const ext = last.replace(/^.*\./s, "").toLowerCase();
    const hasPath = last.length < path.length;
    const hasDot = ext.length < last.length - 1;
    if (!hasDot && hasPath)
      return null;
    return __classPrivateFieldGet(this, _Mime_extensionToType, "f").get(ext) ?? null;
  }
  getExtension(type) {
    if (typeof type !== "string")
      return null;
    type = type?.split?.(";")[0];
    return (type && __classPrivateFieldGet(this, _Mime_typeToExtension, "f").get(type.trim().toLowerCase())) ?? null;
  }
  getAllExtensions(type) {
    if (typeof type !== "string")
      return null;
    return __classPrivateFieldGet(this, _Mime_typeToExtensions, "f").get(type.toLowerCase()) ?? null;
  }
  _freeze() {
    this.define = () => {
      throw new Error("define() not allowed for built-in Mime objects. See https://github.com/broofa/mime/blob/main/README.md#custom-mime-instances");
    };
    Object.freeze(this);
    for (const extensions of __classPrivateFieldGet(this, _Mime_typeToExtensions, "f").values()) {
      Object.freeze(extensions);
    }
    return this;
  }
  _getTestState() {
    return {
      types: __classPrivateFieldGet(this, _Mime_extensionToType, "f"),
      extensions: __classPrivateFieldGet(this, _Mime_typeToExtension, "f")
    };
  }
};
_Mime_extensionToType = /* @__PURE__ */ new WeakMap(), _Mime_typeToExtension = /* @__PURE__ */ new WeakMap(), _Mime_typeToExtensions = /* @__PURE__ */ new WeakMap();
var Mime_default = Mime;

// node_modules/mime/dist/src/index.js
var src_default = new Mime_default(standard_default, other_default)._freeze();

// node_modules/canonicalize/lib/canonicalize.js
function canonicalize(object, seen = /* @__PURE__ */ new Set()) {
  if (typeof object === "number" && isNaN(object)) {
    throw new Error("NaN is not allowed");
  }
  if (typeof object === "number" && !isFinite(object)) {
    throw new Error("Infinity is not allowed");
  }
  if (object === null || typeof object !== "object") {
    return JSON.stringify(object);
  }
  if (typeof object.toJSON === "function") {
    if (seen.has(object)) {
      throw new Error("Circular reference detected");
    }
    seen.add(object);
    const result2 = canonicalize(object.toJSON(), seen);
    seen.delete(object);
    return result2;
  }
  if (seen.has(object)) {
    throw new Error("Circular reference detected");
  }
  seen.add(object);
  let result;
  if (Array.isArray(object)) {
    const values = object.map((cv) => {
      const value = cv === void 0 || typeof cv === "symbol" ? null : cv;
      return canonicalize(value, seen);
    });
    result = `[${values.join(",")}]`;
  } else {
    const parts = [];
    for (const key of Object.keys(object).sort()) {
      if (object[key] === void 0 || typeof object[key] === "symbol") {
        continue;
      }
      parts.push(`${canonicalize(key)}:${canonicalize(object[key], seen)}`);
    }
    result = `{${parts.join(",")}}`;
  }
  seen.delete(object);
  return result;
}

// lattice/packages/lattice/dist/index.js
var textEncoder$2 = new TextEncoder();
var BAND = {
  SAFETY: 0,
  OBSERVABILITY: 1,
  EXTENSION: 2
};
var BAND_ORDER = [
  BAND.SAFETY,
  BAND.OBSERVABILITY,
  BAND.EXTENSION
];
var PIPELINE_FROZEN_ERROR_NAME = "PIPELINE_FROZEN";
var HOOK_TIMEOUT_EVENT_NAME = "HOOK_TIMEOUT";
function freezeContext(ctx) {
  let cloned;
  try {
    cloned = structuredClone(ctx);
  } catch {
    cloned = ctx;
  }
  if (typeof cloned === "object" && cloned !== null) Object.freeze(cloned);
  return cloned;
}
async function runHandlerWithBudget(record, ctx, emit, event, sessionId) {
  const startedAt = performance.now();
  let timeoutFired = false;
  const budgetMs = record.budgetMs;
  const budgetPromise = new Promise((resolve) => {
    setTimeout(() => {
      timeoutFired = true;
      resolve("__timeout__");
    }, budgetMs);
  });
  const handlerPromise = (async () => {
    try {
      await record.handler(ctx);
    } catch {
    }
    return "__done__";
  })();
  if (await Promise.race([handlerPromise, budgetPromise]) === "__timeout__" && timeoutFired) {
    const elapsedMs = Math.round(performance.now() - startedAt);
    if (emit !== void 0) emit(HOOK_TIMEOUT_EVENT_NAME, {
      event,
      band: record.band,
      budgetMs,
      ...sessionId !== void 0 ? { sessionId } : {},
      handlerIndex: record.registrationIndex,
      elapsedMs
    });
  }
}
function createHookPipeline(options) {
  const tracer = options?.tracer;
  const sessionId = options?.sessionId;
  const defaultBudgetMs = options?.defaultBudgetMs ?? 100;
  const registry = /* @__PURE__ */ new Map();
  let frozen = false;
  let globalRegistrationCounter = 0;
  const emit = tracer !== void 0 ? (kind, payload) => {
    tracer.event?.(kind, payload);
  } : void 0;
  function register(event, handler, opts) {
    if (frozen) {
      const err = /* @__PURE__ */ new Error("HookPipeline.register() called after freeze()");
      err.name = PIPELINE_FROZEN_ERROR_NAME;
      throw err;
    }
    let perEventBands = registry.get(event);
    if (perEventBands === void 0) {
      perEventBands = /* @__PURE__ */ new Map();
      registry.set(event, perEventBands);
    }
    let arr = perEventBands.get(opts.band);
    if (arr === void 0) {
      arr = [];
      perEventBands.set(opts.band, arr);
    }
    const record = {
      handler,
      ...opts.matcher !== void 0 ? { matcher: opts.matcher } : {},
      budgetMs: opts.budgetMs ?? defaultBudgetMs,
      band: opts.band,
      registrationIndex: globalRegistrationCounter
    };
    globalRegistrationCounter += 1;
    arr.push(record);
  }
  function freezePipeline() {
    frozen = true;
  }
  function isFrozen() {
    return frozen;
  }
  async function run(event, context) {
    const perEventBands = registry.get(event);
    if (perEventBands === void 0) return;
    for (const band of BAND_ORDER) {
      const arr = perEventBands.get(band);
      if (arr === void 0 || arr.length === 0) continue;
      for (const record of arr) {
        if (record.matcher !== void 0 && !record.matcher.test(event)) continue;
        await runHandlerWithBudget(record, freezeContext(context), emit, event, sessionId);
      }
    }
  }
  return {
    kind: "hook-pipeline",
    register,
    freeze: freezePipeline,
    isFrozen,
    run
  };
}
var encoder = new TextEncoder();
function stringifyCostUsd(costUsd) {
  if (costUsd === null) return null;
  if (!Number.isFinite(costUsd)) return null;
  return costUsd.toString();
}
function usageToCanonical(usage) {
  return {
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    costUsd: stringifyCostUsd(usage.costUsd)
  };
}
function canonicalizeReceiptBody(body) {
  const json = canonicalize(body);
  if (json === void 0) throw new Error("canonicalizeReceiptBody: canonicalize returned undefined; receipt body contained a non-canonicalizable value (function/symbol/undefined).");
  return encoder.encode(json);
}
var PAYLOAD_TYPE = "application/vnd.lattice.receipt+json";
var textEncoder$1 = new TextEncoder();
function base64Encode(bytes) {
  return Buffer.from(bytes).toString("base64");
}
function buildPae(payloadType, payloadBase64) {
  const ascii = "DSSEv1 " + payloadType.length.toString() + " " + payloadType + " " + payloadBase64.length.toString() + " " + payloadBase64;
  return textEncoder$1.encode(ascii);
}
function encodeEnvelope(input) {
  return {
    payloadType: PAYLOAD_TYPE,
    payload: base64Encode(input.payloadBytes),
    signatures: input.signatures.map((entry) => ({
      keyid: entry.keyid,
      sig: base64Encode(entry.sig)
    }))
  };
}
var DEFAULT_REDACTION_POLICY_ID = "lattice.default.v1";
function redactReceiptBody(body, policyId = DEFAULT_REDACTION_POLICY_ID) {
  const redactions = [];
  if (body.tripwireEvidence !== void 0 && body.tripwireEvidence.kind === "no-pii") redactions.push({
    path: "tripwireEvidence.observed",
    reason: "no-pii-detector-substring-only"
  });
  const sorted = [...redactions].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return {
    body: {
      ...body,
      redactionPolicyId: policyId,
      redactions: sorted
    },
    redactions: sorted
  };
}
async function createReceipt(input, signer2) {
  const policyId = input.redactionPolicyId ?? "lattice.default.v1";
  const receiptId = input.receiptId ?? crypto.randomUUID();
  const issuedAt = input.issuedAt ?? (/* @__PURE__ */ new Date()).toISOString();
  const { body } = redactReceiptBody({
    version: input.stepName !== void 0 || input.stepIndex !== void 0 || input.parentStepName !== void 0 || input.previousStepName !== void 0 || input.sessionId !== void 0 || input.timestamp !== void 0 ? "lattice-receipt/v1.1" : "lattice-receipt/v1",
    receiptId,
    runId: input.runId,
    issuedAt,
    kid: signer2.kid,
    model: input.model,
    route: input.route,
    usage: usageToCanonical(input.usage),
    contractVerdict: input.contractVerdict,
    contractHash: input.contractHash,
    inputHashes: input.inputHashes,
    outputHash: input.outputHash,
    redactionPolicyId: policyId,
    redactions: [],
    ...input.noRouteReasons !== void 0 ? { noRouteReasons: input.noRouteReasons } : {},
    ...input.tripwireEvidence !== void 0 ? { tripwireEvidence: input.tripwireEvidence } : {},
    ...input.stepName !== void 0 ? { stepName: input.stepName } : {},
    ...input.stepIndex !== void 0 ? { stepIndex: input.stepIndex } : {},
    ...input.parentStepName !== void 0 ? { parentStepName: input.parentStepName } : {},
    ...input.previousStepName !== void 0 ? { previousStepName: input.previousStepName } : {},
    ...input.sessionId !== void 0 ? { sessionId: input.sessionId } : {},
    ...input.timestamp !== void 0 ? { timestamp: input.timestamp } : {}
  }, policyId);
  const payloadBytes = canonicalizeReceiptBody(body);
  const pae = buildPae(PAYLOAD_TYPE, base64Encode(payloadBytes));
  const sig = await signer2.sign(pae);
  return encodeEnvelope({
    payloadBytes,
    signatures: [{
      keyid: signer2.kid,
      sig
    }]
  });
}
var STEP_TRANSITION_EVENT_NAME = "step.transition";
var DEFAULT_CHECKPOINT_BAND = BAND.OBSERVABILITY;
var DEFAULT_MODEL = {
  requested: "lattice-checkpoint/observability",
  observed: null
};
var DEFAULT_ROUTE = {
  providerId: "lattice-checkpoint",
  capabilityId: "lattice-checkpoint/step-transition",
  attemptNumber: 1
};
var DEFAULT_USAGE = {
  promptTokens: 0,
  completionTokens: 0,
  costUsd: null
};
function createCheckpointHook(options) {
  const runId = options.runId;
  const tracer = options.tracer;
  const signer2 = options.signer;
  const sessionId = options.sessionId;
  const model = options.model ?? DEFAULT_MODEL;
  const route = options.route ?? DEFAULT_ROUTE;
  const contractVerdict = options.contractVerdict ?? "success";
  return async function checkpointHookHandler(ctx) {
    const baseMetadata = {
      runId,
      stepName: ctx.stepName,
      stepIndex: ctx.stepIndex,
      timestamp: ctx.timestamp,
      ...ctx.parentStepName !== void 0 ? { parentStepName: ctx.parentStepName } : {},
      ...ctx.previousStepName !== void 0 ? { previousStepName: ctx.previousStepName } : {},
      ...sessionId !== void 0 ? { sessionId } : {}
    };
    let envelope;
    let receiptId;
    let mintError;
    if (signer2 !== void 0) try {
      envelope = await createReceipt({
        runId,
        model,
        route,
        usage: DEFAULT_USAGE,
        contractVerdict,
        contractHash: null,
        inputHashes: [],
        outputHash: null,
        stepName: ctx.stepName,
        stepIndex: ctx.stepIndex,
        timestamp: ctx.timestamp,
        ...ctx.parentStepName !== void 0 ? { parentStepName: ctx.parentStepName } : {},
        ...ctx.previousStepName !== void 0 ? { previousStepName: ctx.previousStepName } : {},
        ...sessionId !== void 0 ? { sessionId } : {}
      }, signer2);
      receiptId = extractReceiptId(envelope);
    } catch (err) {
      mintError = err instanceof Error ? err.message : String(err);
    }
    const metadata = {
      ...baseMetadata,
      ...receiptId !== void 0 ? { receiptId } : {},
      ...envelope !== void 0 ? { envelope } : {},
      ...mintError !== void 0 ? { mintError } : {}
    };
    tracer?.event?.(STEP_TRANSITION_EVENT_NAME, metadata);
  };
}
function extractReceiptId(envelope) {
  try {
    const bytes = Uint8Array.from(atob(envelope.payload), (c) => c.charCodeAt(0));
    const body = JSON.parse(new TextDecoder().decode(bytes));
    return typeof body.receiptId === "string" ? body.receiptId : void 0;
  } catch {
    return;
  }
}
function luhn(digits) {
  const cleaned = digits.replace(/\D/g, "");
  if (cleaned.length < 13 || cleaned.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = cleaned.length - 1; i >= 0; i -= 1) {
    const code = cleaned.charCodeAt(i);
    if (code < 48 || code > 57) return false;
    let digit = code - 48;
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}
function execFirst(regex, input) {
  const match = regex.exec(input);
  return match ? match[0] : void 0;
}
var defaultPiiDetectors = Object.freeze([
  {
    name: "email",
    detect(input) {
      const substring = execFirst(/[\w.+-]+@[\w-]+\.[\w.-]+/, input);
      return substring !== void 0 ? {
        matched: true,
        substring
      } : { matched: false };
    }
  },
  {
    name: "us-ssn",
    detect(input) {
      const substring = execFirst(/\b\d{3}-\d{2}-\d{4}\b/, input);
      return substring !== void 0 ? {
        matched: true,
        substring
      } : { matched: false };
    }
  },
  {
    name: "credit-card",
    detect(input) {
      const candidate = execFirst(/\b(?:\d[ -]?){13,19}\b/, input);
      if (candidate === void 0) return { matched: false };
      const trimmed = candidate.replace(/[ -]+$/, "");
      if (!luhn(trimmed)) return { matched: false };
      return {
        matched: true,
        substring: trimmed
      };
    }
  },
  {
    name: "us-phone",
    detect(input) {
      const substring = execFirst(/\b\d{3}-\d{3}-\d{4}\b|\(\d{3}\)\s?\d{3}-\d{4}/, input);
      return substring !== void 0 ? {
        matched: true,
        substring
      } : { matched: false };
    }
  }
]);
function defaultCapabilityForProvider(providerId) {
  return {
    providerId,
    modelId: `${providerId}:default`,
    inputModalities: [
      "text",
      "json",
      "image",
      "audio",
      "document",
      "file",
      "url",
      "tool"
    ],
    outputModalities: ["text", "json"],
    fileTransport: [
      "inline",
      "json",
      "url",
      "base64",
      "extracted-text",
      "transcript"
    ],
    contextWindow: 16e3,
    structuredOutput: true,
    toolUse: false,
    streaming: false,
    pricing: {
      inputCostPer1M: 0,
      outputCostPer1M: 0,
      inputPer1kTokens: 0,
      outputPer1kTokens: 0
    },
    latency: "interactive",
    dataPolicy: {
      privacy: ["standard", "sensitive"],
      uploadRetention: "none",
      supportsNoLogging: true,
      supportsNoTraining: true
    },
    available: true
  };
}
var ALG = "Ed25519";
function toArrayBuffer$1(bytes) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
async function importEd25519PrivateKey(jwk) {
  return crypto.subtle.importKey("jwk", jwk, ALG, true, ["sign"]);
}
async function generateEd25519KeyPairJwk() {
  const pair = await crypto.subtle.generateKey(ALG, true, ["sign", "verify"]);
  const [privateKeyJwk, publicKeyJwk] = await Promise.all([crypto.subtle.exportKey("jwk", pair.privateKey), crypto.subtle.exportKey("jwk", pair.publicKey)]);
  return {
    privateKeyJwk,
    publicKeyJwk
  };
}
function createInMemorySigner(privateKeyJwk, options) {
  let cachedKey;
  const ensureKey = async () => {
    if (cachedKey === void 0) cachedKey = await importEd25519PrivateKey(privateKeyJwk);
    return cachedKey;
  };
  return {
    kid: options.kid,
    publicKeyJwk: options.publicKeyJwk,
    async sign(bytes) {
      const key = await ensureKey();
      const sig = await crypto.subtle.sign(ALG, key, toArrayBuffer$1(bytes));
      return new Uint8Array(sig);
    }
  };
}
function createOpenAICompatibleProvider(options) {
  const id = options.id ?? "openai-compatible";
  const fetchImpl = options.fetch ?? fetch;
  return {
    id,
    kind: "provider-adapter",
    capabilities: [{
      ...defaultCapabilityForProvider(id),
      modelId: options.model,
      fileTransport: [
        "inline",
        "json",
        "url",
        "base64",
        "extracted-text",
        "transcript"
      ]
    }],
    async execute(request) {
      const init = {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...options.apiKey !== void 0 ? { authorization: `Bearer ${options.apiKey}` } : {}
        },
        body: JSON.stringify({
          model: options.model,
          messages: [{
            role: "user",
            content: [
              {
                type: "text",
                text: request.task
              },
              {
                type: "text",
                text: JSON.stringify({ contextPack: request.contextPack === void 0 ? void 0 : {
                  id: request.contextPack.id,
                  tokenBudget: request.contextPack.tokenBudget,
                  estimatedTokens: request.contextPack.estimatedTokens,
                  included: request.contextPack.included,
                  summarized: request.contextPack.summarized,
                  archived: request.contextPack.archived,
                  omitted: request.contextPack.omitted,
                  warnings: request.contextPack.warnings
                } })
              },
              ...request.artifacts.map((inputArtifact) => ({
                type: "text",
                text: JSON.stringify({
                  artifactId: inputArtifact.id,
                  kind: inputArtifact.kind,
                  mediaType: inputArtifact.mediaType,
                  privacy: inputArtifact.privacy,
                  transport: request.providerPackaging?.artifacts.find((item) => item.artifactId === inputArtifact.id)?.transport ?? request.plan?.providerPackaging?.artifacts.find((item) => item.artifactId === inputArtifact.id)?.transport,
                  value: typeof inputArtifact.value === "string" && inputArtifact.kind !== "url" ? inputArtifact.value : void 0,
                  url: inputArtifact.kind === "url" && typeof inputArtifact.value === "string" ? inputArtifact.value : void 0
                })
              }))
            ]
          }]
        }),
        ...request.signal !== void 0 ? { signal: request.signal } : {}
      };
      const response = await fetchImpl(`${options.baseUrl.replace(/\/$/u, "")}/chat/completions`, init);
      if (!response.ok) throw new Error(`OpenAI-compatible provider failed with ${response.status}.`);
      const body = await response.json();
      const text = String(body.choices?.[0]?.message?.content ?? "");
      const usage = normalizeUsage(body.usage);
      const normalizedUsage = normalizeUsageToRunUsage(body.usage, options.pricing);
      return {
        rawOutputs: Object.fromEntries(request.outputs.map((name) => [name, text])),
        ...usage !== void 0 ? { usage } : {},
        normalizedUsage,
        rawResponse: body
      };
    }
  };
}
function normalizeUsageToRunUsage(rawUsage, pricing) {
  let promptTokens = 0;
  let completionTokens = 0;
  if (typeof rawUsage === "object" && rawUsage !== null) {
    const record = rawUsage;
    promptTokens = numberField$2(record, "prompt_tokens") ?? numberField$2(record, "input_tokens") ?? numberField$2(record, "inputTokens") ?? 0;
    completionTokens = numberField$2(record, "completion_tokens") ?? numberField$2(record, "output_tokens") ?? numberField$2(record, "outputTokens") ?? 0;
  }
  let costUsd = null;
  if (pricing !== void 0 && (pricing.inputPer1kTokens !== void 0 || pricing.outputPer1kTokens !== void 0)) costUsd = (pricing.inputPer1kTokens ?? 0) * promptTokens / 1e3 + (pricing.outputPer1kTokens ?? 0) * completionTokens / 1e3;
  return {
    promptTokens,
    completionTokens,
    costUsd
  };
}
function normalizeUsage(usage) {
  if (typeof usage !== "object" || usage === null) return;
  const record = usage;
  const inputTokens = numberField$2(record, "prompt_tokens") ?? numberField$2(record, "input_tokens");
  const outputTokens = numberField$2(record, "completion_tokens") ?? numberField$2(record, "output_tokens");
  const totalTokens = numberField$2(record, "total_tokens");
  return {
    ...inputTokens !== void 0 ? { inputTokens } : {},
    ...outputTokens !== void 0 ? { outputTokens } : {},
    ...totalTokens !== void 0 ? { totalTokens } : {}
  };
}
function numberField$2(record, key) {
  const value = record[key];
  return typeof value === "number" ? value : void 0;
}
function createOpenAIProvider(options) {
  return createOpenAICompatibleProvider({
    ...options,
    id: options.id ?? "openai",
    baseUrl: options.baseUrl
  });
}
var DEFAULT_BASE_URL$1 = "https://api.anthropic.com";
var DEFAULT_ANTHROPIC_VERSION = "2023-06-01";
var DEFAULT_MAX_TOKENS = 2e3;
function createAnthropicProvider(options) {
  const id = options.id ?? "anthropic";
  const fetchImpl = options.fetch ?? fetch;
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL$1).replace(/\/$/u, "");
  const anthropicVersion = options.anthropicVersion ?? DEFAULT_ANTHROPIC_VERSION;
  return {
    id,
    kind: "provider-adapter",
    capabilities: [{
      ...defaultCapabilityForProvider(id),
      modelId: options.model,
      fileTransport: [
        "inline",
        "json",
        "url",
        "base64",
        "extracted-text",
        "transcript"
      ]
    }],
    async execute(request) {
      const init = {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": options.apiKey,
          "anthropic-version": anthropicVersion
        },
        body: JSON.stringify({
          model: options.model,
          system: "",
          messages: [{
            role: "user",
            content: request.task
          }],
          max_tokens: DEFAULT_MAX_TOKENS
        }),
        ...request.signal !== void 0 ? { signal: request.signal } : {}
      };
      const response = await fetchImpl(`${baseUrl}/v1/messages`, init);
      if (!response.ok) throw new Error(`Anthropic provider failed with ${response.status}.`);
      const body = await response.json();
      const text = String(body.content?.[0]?.text ?? "");
      const usage = normalizeAnthropicUsage(body.usage);
      const normalizedUsage = normalizeAnthropicUsageToRunUsage(body.usage, options.pricing);
      return {
        rawOutputs: Object.fromEntries(request.outputs.map((name) => [name, text])),
        ...usage !== void 0 ? { usage } : {},
        normalizedUsage,
        rawResponse: body
      };
    }
  };
}
function normalizeAnthropicUsageToRunUsage(rawUsage, pricing) {
  let promptTokens = 0;
  let completionTokens = 0;
  if (typeof rawUsage === "object" && rawUsage !== null) {
    const record = rawUsage;
    promptTokens = numberField$1(record, "input_tokens") ?? numberField$1(record, "inputTokens") ?? 0;
    completionTokens = numberField$1(record, "output_tokens") ?? numberField$1(record, "outputTokens") ?? 0;
  }
  let costUsd = null;
  if (pricing !== void 0 && (pricing.inputPer1kTokens !== void 0 || pricing.outputPer1kTokens !== void 0)) costUsd = (pricing.inputPer1kTokens ?? 0) * promptTokens / 1e3 + (pricing.outputPer1kTokens ?? 0) * completionTokens / 1e3;
  return {
    promptTokens,
    completionTokens,
    costUsd
  };
}
function normalizeAnthropicUsage(usage) {
  if (typeof usage !== "object" || usage === null) return;
  const record = usage;
  const inputTokens = numberField$1(record, "input_tokens");
  const outputTokens = numberField$1(record, "output_tokens");
  const totalTokens = inputTokens !== void 0 && outputTokens !== void 0 ? inputTokens + outputTokens : void 0;
  return {
    ...inputTokens !== void 0 ? { inputTokens } : {},
    ...outputTokens !== void 0 ? { outputTokens } : {},
    ...totalTokens !== void 0 ? { totalTokens } : {}
  };
}
function numberField$1(record, key) {
  const value = record[key];
  return typeof value === "number" ? value : void 0;
}
var DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com";
var DEFAULT_MAX_OUTPUT_TOKENS = 2e3;
var DEFAULT_TEMPERATURE = 0.7;
var DEFAULT_TOP_P = 0.9;
var SAFETY_SETTINGS = [
  {
    category: "HARM_CATEGORY_HARASSMENT",
    threshold: "BLOCK_NONE"
  },
  {
    category: "HARM_CATEGORY_HATE_SPEECH",
    threshold: "BLOCK_NONE"
  },
  {
    category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    threshold: "BLOCK_NONE"
  },
  {
    category: "HARM_CATEGORY_DANGEROUS_CONTENT",
    threshold: "BLOCK_NONE"
  }
];
function createGeminiProvider(options) {
  const id = options.id ?? "gemini";
  const fetchImpl = options.fetch ?? fetch;
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/u, "");
  return {
    id,
    kind: "provider-adapter",
    capabilities: [{
      ...defaultCapabilityForProvider(id),
      modelId: options.model,
      fileTransport: [
        "inline",
        "json",
        "url",
        "base64",
        "extracted-text",
        "transcript"
      ]
    }],
    async execute(request) {
      const init = {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [{ text: request.task }]
          }],
          generationConfig: {
            temperature: DEFAULT_TEMPERATURE,
            topP: DEFAULT_TOP_P,
            maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS
          },
          safetySettings: SAFETY_SETTINGS
        }),
        ...request.signal !== void 0 ? { signal: request.signal } : {}
      };
      const response = await fetchImpl(`${baseUrl}/v1beta/models/${encodeURIComponent(options.model)}:generateContent?key=${encodeURIComponent(options.apiKey)}`, init);
      if (!response.ok) throw new Error(`Gemini provider failed with ${response.status}.`);
      const body = await response.json();
      if (!Array.isArray(body.candidates) || body.candidates.length === 0) throw new Error("Gemini provider returned no candidates.");
      const text = String(body.candidates[0]?.content?.parts?.[0]?.text ?? "");
      const usage = normalizeGeminiUsage(body.usageMetadata);
      const normalizedUsage = normalizeGeminiUsageToRunUsage(body.usageMetadata, options.pricing);
      return {
        rawOutputs: Object.fromEntries(request.outputs.map((name) => [name, text])),
        ...usage !== void 0 ? { usage } : {},
        normalizedUsage,
        rawResponse: body
      };
    }
  };
}
function normalizeGeminiUsageToRunUsage(rawUsage, pricing) {
  let promptTokens = 0;
  let completionTokens = 0;
  if (typeof rawUsage === "object" && rawUsage !== null) {
    const record = rawUsage;
    promptTokens = numberField(record, "promptTokenCount") ?? 0;
    completionTokens = numberField(record, "candidatesTokenCount") ?? 0;
  }
  let costUsd = null;
  if (pricing !== void 0 && (pricing.inputPer1kTokens !== void 0 || pricing.outputPer1kTokens !== void 0)) costUsd = (pricing.inputPer1kTokens ?? 0) * promptTokens / 1e3 + (pricing.outputPer1kTokens ?? 0) * completionTokens / 1e3;
  return {
    promptTokens,
    completionTokens,
    costUsd
  };
}
function normalizeGeminiUsage(usage) {
  if (typeof usage !== "object" || usage === null) return;
  const record = usage;
  const inputTokens = numberField(record, "promptTokenCount");
  const outputTokens = numberField(record, "candidatesTokenCount");
  const totalTokens = numberField(record, "totalTokenCount");
  return {
    ...inputTokens !== void 0 ? { inputTokens } : {},
    ...outputTokens !== void 0 ? { outputTokens } : {},
    ...totalTokens !== void 0 ? { totalTokens } : {}
  };
}
function numberField(record, key) {
  const value = record[key];
  return typeof value === "number" ? value : void 0;
}
var DEFAULT_LM_STUDIO_BASE_URL = "http://localhost:1234/v1";
function createLmStudioProvider(options) {
  return createOpenAICompatibleProvider({
    ...options,
    id: options.id ?? "lm-studio",
    baseUrl: options.baseUrl ?? DEFAULT_LM_STUDIO_BASE_URL
  });
}
var DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
function createOpenRouterProvider(options) {
  return createOpenAICompatibleProvider({
    ...options,
    id: options.id ?? "openrouter",
    baseUrl: options.baseUrl ?? DEFAULT_OPENROUTER_BASE_URL
  });
}
var DEFAULT_XAI_BASE_URL = "https://api.x.ai/v1";
function createXaiProvider(options) {
  const inner = createOpenAICompatibleProvider({
    ...options,
    id: options.id ?? "xai",
    baseUrl: options.baseUrl ?? DEFAULT_XAI_BASE_URL
  });
  const innerExecute = inner.execute;
  if (innerExecute === void 0) return inner;
  return {
    ...inner,
    async execute(request) {
      const response = await innerExecute(request);
      const reasoningTokens = response.rawResponse?.usage?.completion_tokens_details?.reasoning_tokens;
      if (typeof reasoningTokens === "number" && response.usage !== void 0) {
        const inputTokens = response.usage.inputTokens ?? 0;
        const outputTokens = response.usage.outputTokens ?? 0;
        return {
          ...response,
          usage: {
            ...response.usage,
            totalTokens: inputTokens + outputTokens + reasoningTokens
          }
        };
      }
      return response;
    }
  };
}
var textEncoder = new TextEncoder();
function createNoopSurvivabilityAdapter(options = {}) {
  const id = options.id ?? "noop-survivability";
  const defaultPolicy = options.policy ?? "SAFE";
  const hooks = /* @__PURE__ */ new Set();
  return {
    kind: "survivability-adapter",
    id,
    serialize(state) {
      return {
        kind: "survivability-snapshot",
        version: "lattice-survivability/v1",
        payload: JSON.stringify(state ?? null),
        capturedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    },
    deserialize(snapshot) {
      return JSON.parse(snapshot.payload);
    },
    onEviction(hook) {
      hooks.add(hook);
      let unsubscribed = false;
      return () => {
        if (unsubscribed) return;
        unsubscribed = true;
        hooks.delete(hook);
      };
    },
    async resume(_snapshot) {
      return defaultPolicy;
    }
  };
}

// extension/offscreen/lattice-host.js
var HOST_TAG = "[FSB lattice-host]";
var PROVIDER_FACTORIES = {
  xai: createXaiProvider,
  openai: createOpenAIProvider,
  anthropic: createAnthropicProvider,
  gemini: createGeminiProvider,
  openrouter: createOpenRouterProvider,
  lmstudio: createLmStudioProvider,
  // FSB key 'lmstudio' (no hyphen) -> Lattice 'createLmStudioProvider' (camelCase Lm)
  custom: createOpenAICompatibleProvider
  // FSB key 'custom'   -> Lattice 'createOpenAICompatibleProvider'
};
var _inflightAborts = /* @__PURE__ */ new Map();
function _trim(s) {
  return typeof s === "string" ? s.trim() : "";
}
function computeUrl(providerKey, config) {
  switch (providerKey) {
    case "xai":
      return "https://api.x.ai/v1/chat/completions";
    case "openai":
      return "https://api.openai.com/v1/chat/completions";
    // baseUrl ignored (see WR-03 note above)
    case "anthropic":
      return "https://api.anthropic.com/v1/messages";
    case "gemini": {
      const apiKey = encodeURIComponent(_trim(config && config.apiKey));
      const model = config && config.model || "gemini-1.5-flash";
      return "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + apiKey;
    }
    case "openrouter":
      return "https://openrouter.ai/api/v1/chat/completions";
    case "lmstudio": {
      const base = (config && config.baseUrl || "http://localhost:1234/v1").replace(/\/+$/, "");
      return base + "/chat/completions";
    }
    case "custom": {
      const ep = (config && config.baseUrl || "").replace(/\/+$/, "");
      return ep.endsWith("/chat/completions") ? ep : ep + "/chat/completions";
    }
    default:
      throw new Error("computeUrl: unknown provider " + providerKey);
  }
}
function computeHeaders(providerKey, config) {
  const headers = { "Content-Type": "application/json" };
  const apiKey = _trim(config && config.apiKey);
  switch (providerKey) {
    case "xai":
    case "openai":
    case "openrouter":
    case "custom":
      headers["Authorization"] = "Bearer " + apiKey;
      return headers;
    case "anthropic":
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
      return headers;
    case "gemini":
      return headers;
    // auth via ?key= query
    case "lmstudio":
      return headers;
    // no auth by convention
    default:
      throw new Error("computeHeaders: unknown provider " + providerKey);
  }
}
console.log(HOST_TAG, "boot: Plan 05-04 offscreen Lattice host loaded");
var survivability = createNoopSurvivabilityAdapter({ id: "fsb-offscreen-noop" });
console.log(HOST_TAG, "survivability adapter id:", survivability.id, "kind:", survivability.kind);
var signer = null;
var pipeline = null;
(async () => {
  const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
  signer = createInMemorySigner(privateKeyJwk, { kid: "fsb-offscreen-ephemeral", publicKeyJwk });
  pipeline = createHookPipeline();
  console.log(HOST_TAG, "ephemeral signer + hook pipeline ready");
})().catch((err) => {
  console.error(HOST_TAG, "boot init failed:", err && err.message ? err.message : err);
});
if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== "object") return false;
    if (sender && sender.id && sender.id !== chrome.runtime.id) {
      console.warn(HOST_TAG, "rejecting cross-extension message from", sender.id);
      return false;
    }
    if (message.type !== "lattice-step-transition") return false;
    if (!signer || !pipeline) {
      console.warn(HOST_TAG, "boot init not complete; dropping step-transition message");
      return false;
    }
    const payload = message.payload || {};
    const runId = String(payload.runId || "");
    const stepName = String(payload.stepName || "");
    const stepIndex = Number(payload.stepIndex);
    const timestamp = String(payload.timestamp || (/* @__PURE__ */ new Date()).toISOString());
    if (!runId || !stepName || !Number.isFinite(stepIndex)) {
      console.warn(HOST_TAG, "invalid step-transition payload; dropping");
      return false;
    }
    const handler = createCheckpointHook({
      runId,
      signer,
      sessionId: payload.sessionId,
      tracer: {
        event: (kind, metadata) => {
          if (kind !== STEP_TRANSITION_EVENT_NAME) return;
          if (metadata && metadata.envelope) {
            chrome.runtime.sendMessage({
              type: "lattice-receipt-minted",
              payload: {
                envelope: metadata.envelope,
                runId,
                stepIndex
              }
            }).catch((err) => {
              console.warn(HOST_TAG, "sendMessage receipt-minted failed:", err && err.message);
            });
          } else if (metadata && metadata.mintError) {
            chrome.runtime.sendMessage({
              type: "lattice-receipt-mint-failed",
              payload: {
                runId,
                stepIndex,
                mintError: String(metadata.mintError)
              }
            }).catch((err) => {
              console.warn(HOST_TAG, "sendMessage mint-failed failed:", err && err.message);
            });
          }
        }
      }
    });
    pipeline.register("AFTER_TOOL", handler, { band: DEFAULT_CHECKPOINT_BAND });
    const ctx = {
      stepName,
      stepIndex,
      timestamp,
      ...payload.parentStepName !== void 0 ? { parentStepName: payload.parentStepName } : {},
      ...payload.previousStepName !== void 0 ? { previousStepName: payload.previousStepName } : {}
    };
    pipeline.run("AFTER_TOOL", ctx).catch((err) => {
      console.error(HOST_TAG, "pipeline.run failed:", err && err.message ? err.message : err);
    });
    return false;
  });
  console.log(HOST_TAG, "chrome.runtime.onMessage listener registered for 'lattice-step-transition'");
} else {
  console.warn(HOST_TAG, "chrome.runtime.onMessage not available; SW <-> offscreen bus unavailable (Node test context?)");
}
if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== "object") return false;
    if (sender && sender.id && sender.id !== chrome.runtime.id) return false;
    if (message.type === "lattice-provider-abort") {
      const ctl = _inflightAborts.get(message.requestId);
      if (ctl) {
        try {
          ctl.abort();
        } catch (_e) {
        }
      }
      return false;
    }
    if (message.type !== "lattice-provider-execute") return false;
    const requestId = String(message.requestId || "");
    const providerKey = String(message.provider || "");
    const config = message.config || {};
    const requestBody = message.requestBody || {};
    const mode = message.mode || "autopilot";
    if (!requestId) {
      sendResponse({
        ok: false,
        error: { kind: "invalid_provider", message: "Missing requestId" }
      });
      return false;
    }
    const factory = PROVIDER_FACTORIES[providerKey];
    if (typeof factory !== "function") {
      sendResponse({
        ok: false,
        error: { kind: "invalid_provider", message: "Unknown provider: " + providerKey }
      });
      return false;
    }
    const controller = new AbortController();
    _inflightAborts.set(requestId, controller);
    (async () => {
      try {
        if (mode === "test-connection") {
          const adapter = factory({
            apiKey: _trim(config.apiKey),
            model: config.model,
            baseUrl: config.baseUrl
          });
          const response = await adapter.execute({
            task: "Test connection.",
            artifacts: [],
            outputs: ["text"]
          }, { signal: controller.signal });
          sendResponse({ ok: true, response });
        } else {
          factory({
            apiKey: _trim(config.apiKey),
            model: config.model,
            baseUrl: config.baseUrl
          });
          const url = computeUrl(providerKey, config);
          const headers = computeHeaders(providerKey, config);
          const fetchResp = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(requestBody),
            signal: controller.signal
          });
          if (!fetchResp.ok) {
            const status = fetchResp.status;
            let text = "";
            try {
              text = await fetchResp.text();
            } catch (_e) {
            }
            const err = new Error(providerKey + " provider failed with " + status + (text ? ": " + text : ""));
            err.status = status;
            err.providerError = text;
            throw err;
          }
          const json = await fetchResp.json();
          sendResponse({ ok: true, response: { rawResponse: json } });
        }
      } catch (err) {
        const isAbort = err && (err.name === "AbortError" || /abort/i.test(String(err && err.message || "")));
        sendResponse({
          ok: false,
          error: {
            kind: isAbort ? "aborted" : mode === "autopilot" ? "fetch_error" : "adapter_error",
            message: String(err && err.message ? err.message : err),
            status: err && typeof err.status === "number" ? err.status : void 0,
            providerError: err && err.providerError ? err.providerError : void 0
          }
        });
      } finally {
        _inflightAborts.delete(requestId);
      }
    })();
    return true;
  });
  console.log(HOST_TAG, "boot: Phase 6 Plan 06-01 lattice-provider-execute + abort handlers registered");
}
