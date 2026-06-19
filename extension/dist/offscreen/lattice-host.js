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
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};

// node_modules/mime/dist/types/other.js
var types, other_default;
var init_other = __esm({
  "node_modules/mime/dist/types/other.js"() {
    types = {
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
    other_default = types;
  }
});

// node_modules/mime/dist/types/standard.js
var types2, standard_default;
var init_standard = __esm({
  "node_modules/mime/dist/types/standard.js"() {
    types2 = {
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
    standard_default = types2;
  }
});

// node_modules/mime/dist/src/Mime.js
var __classPrivateFieldGet, _Mime_extensionToType, _Mime_typeToExtension, _Mime_typeToExtensions, Mime, Mime_default;
var init_Mime = __esm({
  "node_modules/mime/dist/src/Mime.js"() {
    __classPrivateFieldGet = function(receiver, state, kind, f) {
      if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
      if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
      return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
    };
    Mime = class {
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
    Mime_default = Mime;
  }
});

// node_modules/mime/dist/src/index.js
var src_default;
var init_src = __esm({
  "node_modules/mime/dist/src/index.js"() {
    init_other();
    init_standard();
    init_Mime();
    init_Mime();
    src_default = new Mime_default(standard_default, other_default)._freeze();
  }
});

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
var init_canonicalize = __esm({
  "node_modules/canonicalize/lib/canonicalize.js"() {
  }
});

// node_modules/lattice/dist/runtime-BTi8lr_O.js
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
async function runHandlerWithBudget(record, ctx, controls, emit, event, sessionId) {
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
      await record.handler(ctx, controls);
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
  let currentDenialReason = null;
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
    currentDenialReason = null;
    const perEventBands = registry.get(event);
    if (perEventBands === void 0) return;
    const controls = { deny: (reason) => {
      currentDenialReason = reason;
    } };
    for (const band of BAND_ORDER) {
      const arr = perEventBands.get(band);
      if (arr === void 0 || arr.length === 0) continue;
      for (const record of arr) {
        if (record.matcher !== void 0 && !record.matcher.test(event)) continue;
        await runHandlerWithBudget(record, freezeContext(context), controls, emit, event, sessionId);
      }
    }
  }
  function lastDenialReason() {
    return currentDenialReason;
  }
  return {
    kind: "hook-pipeline",
    register,
    freeze: freezePipeline,
    isFrozen,
    run,
    lastDenialReason
  };
}
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
function base64Encode(bytes) {
  return Buffer.from(bytes).toString("base64");
}
function buildPae(payloadType, payloadBase64) {
  const ascii = "DSSEv1 " + payloadType.length.toString() + " " + payloadType + " " + payloadBase64.length.toString() + " " + payloadBase64;
  return textEncoder.encode(ascii);
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
    version: "lattice-receipt/v1.2",
    receiptId,
    runId: input.runId,
    issuedAt,
    kid: signer2.kid,
    model: input.model,
    route: input.route,
    ...input.modelClass !== void 0 ? { modelClass: input.modelClass } : {},
    ...input.parentReceiptCid !== void 0 ? { parentReceiptCid: input.parentReceiptCid } : {},
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
function parseToolUseEnvelope(responseText) {
  if (typeof responseText !== "string" || responseText.length === 0) return null;
  const candidates = extractJsonCandidates(responseText);
  for (const candidate of candidates) {
    const parsed = tryParseEnvelope(candidate);
    if (parsed !== null) return parsed;
  }
  return null;
}
function extractJsonCandidates(text) {
  const candidates = [];
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/g;
  let fenceMatch;
  while ((fenceMatch = fenceRegex.exec(text)) !== null) {
    const inner = fenceMatch[1];
    if (inner !== void 0) candidates.push(inner.trim());
  }
  const braceStart = text.indexOf("{");
  const braceEnd = text.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd > braceStart) candidates.push(text.slice(braceStart, braceEnd + 1));
  candidates.push(text.trim());
  return candidates;
}
function tryParseEnvelope(jsonLike) {
  let parsed;
  try {
    parsed = JSON.parse(jsonLike);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const toolCalls = parsed["tool_calls"];
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return null;
  const requests = [];
  for (const call of toolCalls) {
    if (typeof call !== "object" || call === null) return null;
    const callRecord = call;
    const id = callRecord["id"];
    const name = callRecord["name"];
    const args = callRecord["args"];
    if (typeof id !== "string" || typeof name !== "string") return null;
    requests.push({
      id,
      name,
      args
    });
  }
  return requests;
}
async function validateSchemaOutput(name, schema, value) {
  const result = schema["~standard"].validate(value);
  const validation = result instanceof Promise ? await result : result;
  if (validation.issues) return {
    ok: false,
    issue: {
      ["output"]: name,
      issues: validation.issues.map(normalizeIssue)
    }
  };
  return {
    ok: true,
    value: validation.value
  };
}
function normalizeIssue(issue) {
  const path = issue.path?.map(normalizePathSegment).filter((segment) => segment !== void 0);
  return {
    message: issue.message,
    ...path !== void 0 && path.length > 0 ? { path } : {}
  };
}
function normalizePathSegment(segment) {
  if (typeof segment === "string" || typeof segment === "number" || typeof segment === "symbol") return segment;
  return normalizePathKey(segment.key);
}
function normalizePathKey(key) {
  return key;
}
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
var textEncoder$1, BAND, BAND_ORDER, PIPELINE_FROZEN_ERROR_NAME, HOOK_TIMEOUT_EVENT_NAME, encoder, PAYLOAD_TYPE, textEncoder, DEFAULT_REDACTION_POLICY_ID, STEP_TRANSITION_EVENT_NAME, DEFAULT_CHECKPOINT_BAND, DEFAULT_MODEL, DEFAULT_ROUTE, DEFAULT_USAGE;
var init_runtime_BTi8lr_O = __esm({
  "node_modules/lattice/dist/runtime-BTi8lr_O.js"() {
    init_src();
    init_canonicalize();
    textEncoder$1 = new TextEncoder();
    BAND = {
      SAFETY: 0,
      OBSERVABILITY: 1,
      EXTENSION: 2
    };
    BAND_ORDER = [
      BAND.SAFETY,
      BAND.OBSERVABILITY,
      BAND.EXTENSION
    ];
    PIPELINE_FROZEN_ERROR_NAME = "PIPELINE_FROZEN";
    HOOK_TIMEOUT_EVENT_NAME = "HOOK_TIMEOUT";
    encoder = new TextEncoder();
    PAYLOAD_TYPE = "application/vnd.lattice.receipt+json";
    textEncoder = new TextEncoder();
    DEFAULT_REDACTION_POLICY_ID = "lattice.default.v1";
    STEP_TRANSITION_EVENT_NAME = "step.transition";
    DEFAULT_CHECKPOINT_BAND = BAND.OBSERVABILITY;
    DEFAULT_MODEL = {
      requested: "lattice-checkpoint/observability",
      observed: null
    };
    DEFAULT_ROUTE = {
      providerId: "lattice-checkpoint",
      capabilityId: "lattice-checkpoint/step-transition",
      attemptNumber: 1
    };
    DEFAULT_USAGE = {
      promptTokens: 0,
      completionTokens: 0,
      costUsd: null
    };
  }
});

// node_modules/lattice/dist/index.js
init_runtime_BTi8lr_O();
init_canonicalize();
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
var GENERATED_PROFILES = [
  {
    id: "ai21/jamba-large-1.7",
    adapter: "openrouter",
    originFamily: "ai21",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 256e3,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "aion-labs/aion-1.0",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "aion-labs/aion-1.0-mini",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "aion-labs/aion-2.0",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "aion-labs/aion-rp-llama-3.1-8b",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 32768,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "allenai/olmo-3-32b-think",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 65536,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "amazon/nova-2-lite-v1",
    adapter: "openrouter",
    originFamily: "amazon",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 1e6,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "amazon/nova-lite-v1",
    adapter: "openrouter",
    originFamily: "amazon",
    trainingClass: "mid_tier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 3e5,
    knownFailureModes: ["system_prompt_echo"],
    recommendedPromptStrategy: "mid_tier"
  },
  {
    id: "amazon/nova-micro-v1",
    adapter: "openrouter",
    originFamily: "amazon",
    trainingClass: "mid_tier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 128e3,
    knownFailureModes: ["system_prompt_echo"],
    recommendedPromptStrategy: "mid_tier"
  },
  {
    id: "amazon/nova-premier-v1",
    adapter: "openrouter",
    originFamily: "amazon",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 1e6,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "amazon/nova-pro-v1",
    adapter: "openrouter",
    originFamily: "amazon",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 3e5,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "anthracite-org/magnum-v4-72b",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 16384,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "anthropic/claude-3-haiku",
    adapter: "openrouter",
    originFamily: "anthropic",
    trainingClass: "mid_tier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 2e5,
    knownFailureModes: ["system_prompt_echo"],
    recommendedPromptStrategy: "mid_tier"
  },
  {
    id: "anthropic/claude-3.5-haiku",
    adapter: "openrouter",
    originFamily: "anthropic",
    trainingClass: "mid_tier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 2e5,
    knownFailureModes: ["system_prompt_echo"],
    recommendedPromptStrategy: "mid_tier"
  },
  {
    id: "anthropic/claude-fable-5",
    adapter: "openrouter",
    originFamily: "anthropic",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1e6,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "anthropic/claude-haiku-4.5",
    adapter: "openrouter",
    originFamily: "anthropic",
    trainingClass: "mid_tier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 2e5,
    knownFailureModes: ["system_prompt_echo"],
    recommendedPromptStrategy: "mid_tier"
  },
  {
    id: "anthropic/claude-opus-4",
    adapter: "openrouter",
    originFamily: "anthropic",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 2e5,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "anthropic/claude-opus-4.1",
    adapter: "openrouter",
    originFamily: "anthropic",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 2e5,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "anthropic/claude-opus-4.5",
    adapter: "openrouter",
    originFamily: "anthropic",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 2e5,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "anthropic/claude-opus-4.6",
    adapter: "openrouter",
    originFamily: "anthropic",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1e6,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "anthropic/claude-opus-4.6-fast",
    adapter: "openrouter",
    originFamily: "anthropic",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1e6,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "anthropic/claude-opus-4.7",
    adapter: "openrouter",
    originFamily: "anthropic",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1e6,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "anthropic/claude-opus-4.7-fast",
    adapter: "openrouter",
    originFamily: "anthropic",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1e6,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "anthropic/claude-opus-4.8",
    adapter: "openrouter",
    originFamily: "anthropic",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1e6,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "anthropic/claude-opus-4.8-fast",
    adapter: "openrouter",
    originFamily: "anthropic",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1e6,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "anthropic/claude-sonnet-4",
    adapter: "openrouter",
    originFamily: "anthropic",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 1e6,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "anthropic/claude-sonnet-4.5",
    adapter: "openrouter",
    originFamily: "anthropic",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1e6,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "anthropic/claude-sonnet-4.6",
    adapter: "openrouter",
    originFamily: "anthropic",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1e6,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "arcee-ai/coder-large",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 32768,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "arcee-ai/trinity-large-thinking",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "arcee-ai/trinity-mini",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "arcee-ai/virtuoso-large",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "baidu/ernie-4.5-vl-424b-a47b",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 123e3,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "bytedance-seed/seed-1.6",
    adapter: "openrouter",
    originFamily: "bytedance",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "bytedance-seed/seed-1.6-flash",
    adapter: "openrouter",
    originFamily: "bytedance",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "bytedance-seed/seed-2.0-lite",
    adapter: "openrouter",
    originFamily: "bytedance",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "bytedance-seed/seed-2.0-mini",
    adapter: "openrouter",
    originFamily: "bytedance",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "bytedance/ui-tars-1.5-7b",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 128e3,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 32768,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "cohere/command-a",
    adapter: "openrouter",
    originFamily: "cohere",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 256e3,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "cohere/command-r-08-2024",
    adapter: "openrouter",
    originFamily: "cohere",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 128e3,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "cohere/command-r-plus-08-2024",
    adapter: "openrouter",
    originFamily: "cohere",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 128e3,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "cohere/command-r7b-12-2024",
    adapter: "openrouter",
    originFamily: "cohere",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 128e3,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "deepcogito/cogito-v2.1-671b",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 128e3,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "deepseek/deepseek-chat",
    adapter: "openrouter",
    originFamily: "deepseek",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 128e3,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "deepseek/deepseek-chat-v3-0324",
    adapter: "openrouter",
    originFamily: "deepseek",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 32768,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "deepseek/deepseek-chat-v3.1",
    adapter: "openrouter",
    originFamily: "deepseek",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 163840,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "deepseek/deepseek-r1",
    adapter: "openrouter",
    originFamily: "deepseek",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "inlined_tags",
    toolCallSurface: "native_strict",
    contextWindow: 64e3,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments",
      "reasoning_tag_leak"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "deepseek/deepseek-r1-0528",
    adapter: "openrouter",
    originFamily: "deepseek",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "inlined_tags",
    toolCallSurface: "native_strict",
    contextWindow: 163840,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments",
      "reasoning_tag_leak"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "deepseek/deepseek-r1-distill-llama-70b",
    adapter: "openrouter",
    originFamily: "deepseek",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "inlined_tags",
    toolCallSurface: "none",
    contextWindow: 8192,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments",
      "reasoning_tag_leak"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "deepseek/deepseek-r1-distill-qwen-32b",
    adapter: "openrouter",
    originFamily: "deepseek",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "inlined_tags",
    toolCallSurface: "none",
    contextWindow: 32768,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments",
      "reasoning_tag_leak"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "deepseek/deepseek-v3.1-terminus",
    adapter: "openrouter",
    originFamily: "deepseek",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 163840,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "deepseek/deepseek-v3.2",
    adapter: "openrouter",
    originFamily: "deepseek",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 128e3,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "deepseek/deepseek-v3.2-exp",
    adapter: "openrouter",
    originFamily: "deepseek",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 163840,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "deepseek/deepseek-v4-flash",
    adapter: "openrouter",
    originFamily: "deepseek",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1048576,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "deepseek/deepseek-v4-pro",
    adapter: "openrouter",
    originFamily: "deepseek",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1048576,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "essentialai/rnj-1-instruct",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 32768,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "google/gemini-2.5-flash",
    adapter: "openrouter",
    originFamily: "google",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1048576,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "google/gemini-2.5-flash-image",
    adapter: "openrouter",
    originFamily: "google",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 32768,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "google/gemini-2.5-flash-lite",
    adapter: "openrouter",
    originFamily: "google",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1048576,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "google/gemini-2.5-flash-lite-preview-09-2025",
    adapter: "openrouter",
    originFamily: "google",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1048576,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "google/gemini-2.5-pro",
    adapter: "openrouter",
    originFamily: "google",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1048576,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "google/gemini-2.5-pro-preview",
    adapter: "openrouter",
    originFamily: "google",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1048576,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "google/gemini-2.5-pro-preview-05-06",
    adapter: "openrouter",
    originFamily: "google",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1048576,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "google/gemini-3-flash-preview",
    adapter: "openrouter",
    originFamily: "google",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1048576,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "google/gemini-3-pro-image-preview",
    adapter: "openrouter",
    originFamily: "google",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 65536,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "google/gemini-3.1-flash-image-preview",
    adapter: "openrouter",
    originFamily: "google",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 65536,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "google/gemini-3.1-flash-lite",
    adapter: "openrouter",
    originFamily: "google",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1048576,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "google/gemini-3.1-flash-lite-preview",
    adapter: "openrouter",
    originFamily: "google",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1048576,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "google/gemini-3.1-pro-preview",
    adapter: "openrouter",
    originFamily: "google",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1048576,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "google/gemini-3.1-pro-preview-customtools",
    adapter: "openrouter",
    originFamily: "google",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1048576,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "google/gemini-3.5-flash",
    adapter: "openrouter",
    originFamily: "google",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1048576,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "google/gemma-2-27b-it",
    adapter: "openrouter",
    originFamily: "google",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 8192,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "google/gemma-3-12b-it",
    adapter: "openrouter",
    originFamily: "google",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 131072,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "google/gemma-3-27b-it",
    adapter: "openrouter",
    originFamily: "google",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 131072,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "google/gemma-3-4b-it",
    adapter: "openrouter",
    originFamily: "google",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 131072,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "google/gemma-3n-e4b-it",
    adapter: "openrouter",
    originFamily: "google",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 32768,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "google/gemma-4-26b-a4b-it",
    adapter: "openrouter",
    originFamily: "google",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262144,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "google/gemma-4-26b-a4b-it:free",
    adapter: "openrouter",
    originFamily: "google",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 262144,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "google/gemma-4-31b-it",
    adapter: "openrouter",
    originFamily: "google",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262144,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "google/gemma-4-31b-it:free",
    adapter: "openrouter",
    originFamily: "google",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 262144,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "google/lyria-3-clip-preview",
    adapter: "openrouter",
    originFamily: "google",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 1048576,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "google/lyria-3-pro-preview",
    adapter: "openrouter",
    originFamily: "google",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 1048576,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "gryphe/mythomax-l2-13b",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 4096,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "ibm-granite/granite-4.0-h-micro",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 131e3,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "ibm-granite/granite-4.1-8b",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "inception/mercury-2",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 128e3,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "inclusionai/ling-2.6-1t",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "inclusionai/ling-2.6-flash",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "inclusionai/ring-2.6-1t",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "inflection/inflection-3-pi",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 8e3,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "inflection/inflection-3-productivity",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 8e3,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "kwaipilot/kat-coder-pro-v2",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 256e3,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "liquid/lfm-2-24b-a2b",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 32768,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "liquid/lfm-2.5-1.2b-instruct:free",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 32768,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "liquid/lfm-2.5-1.2b-thinking:free",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 32768,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "mancer/weaver",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 8e3,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "meta-llama/llama-3-70b-instruct",
    adapter: "openrouter",
    originFamily: "meta",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 8192,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "meta-llama/llama-3-8b-instruct",
    adapter: "openrouter",
    originFamily: "meta",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 8192,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "meta-llama/llama-3.1-70b-instruct",
    adapter: "openrouter",
    originFamily: "meta",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "meta-llama/llama-3.1-8b-instruct",
    adapter: "openrouter",
    originFamily: "meta",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "meta-llama/llama-3.2-11b-vision-instruct",
    adapter: "openrouter",
    originFamily: "meta",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "meta-llama/llama-3.2-1b-instruct",
    adapter: "openrouter",
    originFamily: "meta",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 6e4,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "meta-llama/llama-3.2-3b-instruct",
    adapter: "openrouter",
    originFamily: "meta",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 8e4,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "meta-llama/llama-3.2-3b-instruct:free",
    adapter: "openrouter",
    originFamily: "meta",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    adapter: "openrouter",
    originFamily: "meta",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    adapter: "openrouter",
    originFamily: "meta",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 65536,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "meta-llama/llama-4-maverick",
    adapter: "openrouter",
    originFamily: "meta",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1048576,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "meta-llama/llama-4-scout",
    adapter: "openrouter",
    originFamily: "meta",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 327680,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "meta-llama/llama-guard-3-8b",
    adapter: "openrouter",
    originFamily: "meta",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "meta-llama/llama-guard-4-12b",
    adapter: "openrouter",
    originFamily: "meta",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 163840,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "microsoft/phi-4",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 16384,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "microsoft/phi-4-mini-instruct",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 128e3,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "microsoft/wizardlm-2-8x22b",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 65535,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "minimax/minimax-01",
    adapter: "openrouter",
    originFamily: "minimax",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 1000192,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "minimax/minimax-m1",
    adapter: "openrouter",
    originFamily: "minimax",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 1e6,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "minimax/minimax-m2",
    adapter: "openrouter",
    originFamily: "minimax",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 196608,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "minimax/minimax-m2-her",
    adapter: "openrouter",
    originFamily: "minimax",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 65536,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "minimax/minimax-m2.1",
    adapter: "openrouter",
    originFamily: "minimax",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 196608,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "minimax/minimax-m2.5",
    adapter: "openrouter",
    originFamily: "minimax",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 196608,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "minimax/minimax-m2.7",
    adapter: "openrouter",
    originFamily: "minimax",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 204800,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "minimax/minimax-m3",
    adapter: "openrouter",
    originFamily: "minimax",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 524288,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "mistralai/codestral-2508",
    adapter: "openrouter",
    originFamily: "mistral",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 256e3,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "mistralai/devstral-2512",
    adapter: "openrouter",
    originFamily: "mistral",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "mistralai/ministral-14b-2512",
    adapter: "openrouter",
    originFamily: "mistral",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "mistralai/ministral-3b-2512",
    adapter: "openrouter",
    originFamily: "mistral",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "mistralai/ministral-8b-2512",
    adapter: "openrouter",
    originFamily: "mistral",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "mistralai/mistral-large",
    adapter: "openrouter",
    originFamily: "mistral",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 128e3,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "mistralai/mistral-large-2407",
    adapter: "openrouter",
    originFamily: "mistral",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "mistralai/mistral-large-2512",
    adapter: "openrouter",
    originFamily: "mistral",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "mistralai/mistral-medium-3",
    adapter: "openrouter",
    originFamily: "mistral",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "mistralai/mistral-medium-3-5",
    adapter: "openrouter",
    originFamily: "mistral",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "mistralai/mistral-medium-3.1",
    adapter: "openrouter",
    originFamily: "mistral",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "mistralai/mistral-nemo",
    adapter: "openrouter",
    originFamily: "mistral",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "mistralai/mistral-saba",
    adapter: "openrouter",
    originFamily: "mistral",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 32768,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "mistralai/mistral-small-24b-instruct-2501",
    adapter: "openrouter",
    originFamily: "mistral",
    trainingClass: "mid_tier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 32768,
    knownFailureModes: ["system_prompt_echo"],
    recommendedPromptStrategy: "mid_tier"
  },
  {
    id: "mistralai/mistral-small-2603",
    adapter: "openrouter",
    originFamily: "mistral",
    trainingClass: "mid_tier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262144,
    knownFailureModes: ["system_prompt_echo"],
    recommendedPromptStrategy: "mid_tier"
  },
  {
    id: "mistralai/mistral-small-3.1-24b-instruct",
    adapter: "openrouter",
    originFamily: "mistral",
    trainingClass: "mid_tier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 128e3,
    knownFailureModes: ["system_prompt_echo"],
    recommendedPromptStrategy: "mid_tier"
  },
  {
    id: "mistralai/mistral-small-3.2-24b-instruct",
    adapter: "openrouter",
    originFamily: "mistral",
    trainingClass: "mid_tier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 128e3,
    knownFailureModes: ["system_prompt_echo"],
    recommendedPromptStrategy: "mid_tier"
  },
  {
    id: "mistralai/mixtral-8x22b-instruct",
    adapter: "openrouter",
    originFamily: "mistral",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 65536,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "mistralai/voxtral-small-24b-2507",
    adapter: "openrouter",
    originFamily: "mistral",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 32e3,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "moonshotai/kimi-k2",
    adapter: "openrouter",
    originFamily: "moonshot",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "moonshotai/kimi-k2-0905",
    adapter: "openrouter",
    originFamily: "moonshot",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "moonshotai/kimi-k2-thinking",
    adapter: "openrouter",
    originFamily: "moonshot",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "moonshotai/kimi-k2.5",
    adapter: "openrouter",
    originFamily: "moonshot",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "moonshotai/kimi-k2.6",
    adapter: "openrouter",
    originFamily: "moonshot",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262142,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "morph/morph-v3-fast",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 81920,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "morph/morph-v3-large",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "nex-agi/nex-n2-pro:free",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "nousresearch/hermes-3-llama-3.1-405b",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "nousresearch/hermes-3-llama-3.1-405b:free",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "nousresearch/hermes-3-llama-3.1-70b",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "nousresearch/hermes-4-405b",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "nousresearch/hermes-4-70b",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
    adapter: "openrouter",
    originFamily: "nvidia",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "nvidia/nemotron-3-nano-30b-a3b",
    adapter: "openrouter",
    originFamily: "nvidia",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "nvidia/nemotron-3-nano-30b-a3b:free",
    adapter: "openrouter",
    originFamily: "nvidia",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 256e3,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    adapter: "openrouter",
    originFamily: "nvidia",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 256e3,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "nvidia/nemotron-3-super-120b-a12b",
    adapter: "openrouter",
    originFamily: "nvidia",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "nvidia/nemotron-3-super-120b-a12b:free",
    adapter: "openrouter",
    originFamily: "nvidia",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "nvidia/nemotron-3-ultra-550b-a55b",
    adapter: "openrouter",
    originFamily: "nvidia",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "nvidia/nemotron-3-ultra-550b-a55b:free",
    adapter: "openrouter",
    originFamily: "nvidia",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 1e6,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "nvidia/nemotron-3.5-content-safety:free",
    adapter: "openrouter",
    originFamily: "nvidia",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 128e3,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "nvidia/nemotron-nano-12b-v2-vl:free",
    adapter: "openrouter",
    originFamily: "nvidia",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 128e3,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "nvidia/nemotron-nano-9b-v2:free",
    adapter: "openrouter",
    originFamily: "nvidia",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 128e3,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "openai/gpt-3.5-turbo",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 16385,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-3.5-turbo-0613",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 4095,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-3.5-turbo-16k",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 16385,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-3.5-turbo-instruct",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 4095,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-4",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 8191,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-4-turbo",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 128e3,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-4-turbo-preview",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 128e3,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-4.1",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1047576,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-4.1-mini",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1047576,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-4.1-nano",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1047576,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-4o",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 128e3,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-4o-2024-05-13",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 128e3,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-4o-2024-08-06",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 128e3,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-4o-2024-11-20",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 128e3,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-4o-mini",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 128e3,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-4o-mini-2024-07-18",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 128e3,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-4o-mini-search-preview",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 128e3,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-4o-search-preview",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 128e3,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-5",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 4e5,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-5-chat",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 128e3,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-5-codex",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 4e5,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-5-image",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 4e5,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-5-image-mini",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 4e5,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-5-mini",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 4e5,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-5-nano",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 4e5,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-5-pro",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 4e5,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-5.1",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 4e5,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-5.1-chat",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 128e3,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-5.1-codex",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 4e5,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-5.1-codex-max",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 4e5,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-5.1-codex-mini",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 4e5,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-5.2",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 4e5,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-5.2-chat",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 128e3,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-5.2-codex",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 4e5,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-5.2-pro",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 4e5,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-5.3-chat",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 128e3,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-5.3-codex",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 4e5,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-5.4",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 105e4,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-5.4-image-2",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 272e3,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-5.4-mini",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 4e5,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-5.4-nano",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 4e5,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-5.4-pro",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 105e4,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-5.5",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 105e4,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-5.5-pro",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 105e4,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-audio",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 128e3,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-audio-mini",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 128e3,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-chat-latest",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 4e5,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/gpt-oss-120b",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "openai/gpt-oss-120b:free",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "openai/gpt-oss-20b",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "openai/gpt-oss-20b:free",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "openai/gpt-oss-safeguard-20b",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "openai/o1",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "hidden_cot",
    toolCallSurface: "native_strict",
    contextWindow: 2e5,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/o1-pro",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "hidden_cot",
    toolCallSurface: "none",
    contextWindow: 2e5,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/o3",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "hidden_cot",
    toolCallSurface: "native_strict",
    contextWindow: 2e5,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/o3-deep-research",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "hidden_cot",
    toolCallSurface: "native_strict",
    contextWindow: 2e5,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/o3-mini",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "hidden_cot",
    toolCallSurface: "native_strict",
    contextWindow: 2e5,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/o3-mini-high",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "hidden_cot",
    toolCallSurface: "native_strict",
    contextWindow: 2e5,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/o3-pro",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "hidden_cot",
    toolCallSurface: "native_strict",
    contextWindow: 2e5,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/o4-mini",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 2e5,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/o4-mini-deep-research",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 2e5,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openai/o4-mini-high",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 2e5,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "openrouter/auto",
    adapter: "openrouter",
    originFamily: "openrouter",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 2e6,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "openrouter/bodybuilder",
    adapter: "openrouter",
    originFamily: "openrouter",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 128e3,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "openrouter/free",
    adapter: "openrouter",
    originFamily: "openrouter",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 2e5,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "openrouter/fusion",
    adapter: "openrouter",
    originFamily: "openrouter",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 128e3,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "openrouter/owl-alpha",
    adapter: "openrouter",
    originFamily: "openrouter",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1048756,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "openrouter/pareto-code",
    adapter: "openrouter",
    originFamily: "openrouter",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 2e6,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "perceptron/perceptron-mk1",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 32768,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "perplexity/sonar",
    adapter: "openrouter",
    originFamily: "perplexity",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 127072,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "perplexity/sonar-deep-research",
    adapter: "openrouter",
    originFamily: "perplexity",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 128e3,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "perplexity/sonar-pro",
    adapter: "openrouter",
    originFamily: "perplexity",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 2e5,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "perplexity/sonar-pro-search",
    adapter: "openrouter",
    originFamily: "perplexity",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 2e5,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "perplexity/sonar-reasoning-pro",
    adapter: "openrouter",
    originFamily: "perplexity",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 128e3,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "poolside/laguna-m.1:free",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "poolside/laguna-xs.2:free",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "prime-intellect/intellect-3",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen-2.5-72b-instruct",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 32768,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen-2.5-7b-instruct",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 32768,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen-2.5-coder-32b-instruct",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 32768,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen-plus",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 1e6,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen-plus-2025-07-28",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1e6,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen-plus-2025-07-28:thinking",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1e6,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen2.5-vl-72b-instruct",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 32e3,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3-14b",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 40960,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3-235b-a22b",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3-235b-a22b-2507",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3-235b-a22b-thinking-2507",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3-30b-a3b",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 40960,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3-30b-a3b-instruct-2507",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 128e3,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3-30b-a3b-thinking-2507",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3-32b",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 40960,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3-8b",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 40960,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3-coder",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3-coder-30b-a3b-instruct",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 16e4,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3-coder-flash",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 1e6,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3-coder-next",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3-coder-plus",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1e6,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3-coder:free",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 262e3,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3-max",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3-max-thinking",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3-next-80b-a3b-instruct",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3-next-80b-a3b-instruct:free",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3-next-80b-a3b-thinking",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3-vl-235b-a22b-instruct",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3-vl-235b-a22b-thinking",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3-vl-30b-a3b-instruct",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3-vl-30b-a3b-thinking",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3-vl-32b-instruct",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3-vl-8b-instruct",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3-vl-8b-thinking",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3.5-122b-a10b",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3.5-27b",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3.5-35b-a3b",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3.5-397b-a17b",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3.5-9b",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3.5-flash-02-23",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1e6,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3.5-plus-02-15",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1e6,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3.5-plus-20260420",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1e6,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3.6-27b",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3.6-35b-a3b",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3.6-flash",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1e6,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3.6-max-preview",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3.6-plus",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1e6,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3.7-max",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1e6,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "qwen/qwen3.7-plus",
    adapter: "openrouter",
    originFamily: "qwen",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1e6,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "rekaai/reka-edge",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 16384,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "rekaai/reka-flash-3",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 65536,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "relace/relace-apply-3",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 256e3,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "relace/relace-search",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 256e3,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "sao10k/l3-lunaris-8b",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 8192,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "sao10k/l3.1-70b-hanami-x1",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 16e3,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "sao10k/l3.1-euryale-70b",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "sao10k/l3.3-euryale-70b",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "stepfun/step-3.5-flash",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "stepfun/step-3.7-flash",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 256e3,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "switchpoint/router",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "tencent/hunyuan-a13b-instruct",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "tencent/hy3-preview",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "thedrummer/cydonia-24b-v4.1",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "thedrummer/rocinante-12b",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 32768,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "thedrummer/skyfall-36b-v2",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 32768,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "thedrummer/unslopnemo-12b",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 32768,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "undi95/remm-slerp-l2-13b",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 6144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "upstage/solar-pro-3",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 128e3,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "writer/palmyra-x5",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 104e4,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "x-ai/grok-4.20",
    adapter: "openrouter",
    originFamily: "xai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 2e6,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "x-ai/grok-4.20-multi-agent",
    adapter: "openrouter",
    originFamily: "xai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 2e6,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "x-ai/grok-4.3",
    adapter: "openrouter",
    originFamily: "xai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1e6,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "x-ai/grok-build-0.1",
    adapter: "openrouter",
    originFamily: "xai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 256e3,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "xiaomi/mimo-v2-flash",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "xiaomi/mimo-v2.5",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 1048576,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "xiaomi/mimo-v2.5-pro",
    adapter: "openrouter",
    originFamily: "unknown",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 1048576,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "z-ai/glm-4.5",
    adapter: "openrouter",
    originFamily: "zai",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "z-ai/glm-4.5-air",
    adapter: "openrouter",
    originFamily: "zai",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 131070,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "z-ai/glm-4.5v",
    adapter: "openrouter",
    originFamily: "zai",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 65536,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "z-ai/glm-4.6",
    adapter: "openrouter",
    originFamily: "zai",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 202752,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "z-ai/glm-4.6v",
    adapter: "openrouter",
    originFamily: "zai",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 131072,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "z-ai/glm-4.7",
    adapter: "openrouter",
    originFamily: "zai",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 202752,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "z-ai/glm-4.7-flash",
    adapter: "openrouter",
    originFamily: "zai",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 202752,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "z-ai/glm-5",
    adapter: "openrouter",
    originFamily: "zai",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 202752,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "z-ai/glm-5-turbo",
    adapter: "openrouter",
    originFamily: "zai",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 262144,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  },
  {
    id: "z-ai/glm-5.1",
    adapter: "openrouter",
    originFamily: "zai",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 202752,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments"
    ],
    recommendedPromptStrategy: "open_weight"
  }
];
var STATIC_PROFILES = [
  {
    id: "claude-opus-4",
    adapter: "anthropic",
    originFamily: "anthropic",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 2e5,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "gemini-2.5-pro",
    adapter: "gemini",
    originFamily: "google",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 2097152,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  },
  {
    id: "local-template",
    adapter: "lm-studio",
    originFamily: "unknown",
    trainingClass: "local_quantized",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 8192,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "template_artifact_leak",
      "malformed_tool_arguments",
      "premature_termination"
    ],
    recommendedPromptStrategy: "local"
  },
  {
    id: "grok-4",
    adapter: "xai",
    originFamily: "xai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 131072,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier"
  }
];
var OPENROUTER_VARIANT_RE = /^[^/]+\/[^/]+:(?:free|thinking)$/;
function stripOpenRouterVariant(id) {
  if (!OPENROUTER_VARIANT_RE.test(id)) return id;
  const colonIdx = id.lastIndexOf(":");
  return colonIdx === -1 ? id : id.slice(0, colonIdx);
}
var _lookupCache;
function getLookupMap() {
  if (_lookupCache !== void 0) return _lookupCache;
  const map = /* @__PURE__ */ new Map();
  const staticProfiles = STATIC_PROFILES;
  const generatedProfiles = GENERATED_PROFILES;
  for (const profile of staticProfiles) map.set(`${profile.adapter}:${profile.id}`, profile);
  for (const profile of generatedProfiles) map.set(`${profile.adapter}:${profile.id}`, profile);
  _lookupCache = map;
  return map;
}
function getCapabilityProfile(canonicalKey) {
  return getLookupMap().get(canonicalKey);
}
var SANITIZER_BY_FAILURE_MODE = {
  internal_envelope_leak: "unwrapInternalEnvelope",
  reasoning_tag_leak: "stripReasoningTags",
  template_artifact_leak: "stripChatTemplateArtifacts",
  system_prompt_echo: null,
  hallucinated_tool_name: null,
  malformed_tool_arguments: null,
  premature_termination: null
};
function getRecommendedSanitizers(modes) {
  const seen = /* @__PURE__ */ new Set();
  for (const mode of modes) {
    const key = SANITIZER_BY_FAILURE_MODE[mode];
    if (key !== null) seen.add(key);
  }
  return [...seen];
}
var NegotiationAuthError = class extends Error {
  kind = "negotiation-auth-failed";
  adapter;
  modelId;
  httpStatus;
  constructor(adapter, modelId, httpStatus, message) {
    super(message);
    this.name = "NegotiationAuthError";
    this.adapter = adapter;
    this.modelId = modelId;
    this.httpStatus = httpStatus;
  }
};
function synthesizeNegotiatedCapabilitiesFromRegistry(adapter, modelId, source) {
  const profile = getCapabilityProfile(`${adapter}:${modelId}`);
  if (profile === void 0) return {
    modelId,
    contextWindow: 0,
    supports: {
      nativeToolCalling: false,
      structuredOutputs: false,
      parallelToolCalls: false,
      extendedThinking: false,
      streaming: adapter !== "lm-studio"
    },
    knownFailureModes: [],
    recommendedSanitizers: [],
    source
  };
  return mapProfileToNegotiatedCapabilities(profile, source);
}
function mapProfileToNegotiatedCapabilities(profile, source) {
  const nativeToolCalling = profile.toolCallSurface === "native_strict" || profile.toolCallSurface === "native_lenient";
  const extendedThinking = profile.reasoningSurface !== "none" && profile.reasoningSurface !== "hidden_cot";
  const structuredOutputs = profile.trainingClass === "frontier_rlhf";
  const parallelToolCalls = nativeToolCalling;
  const streaming = profile.adapter !== "lm-studio";
  return {
    modelId: profile.id,
    contextWindow: profile.contextWindow,
    supports: {
      nativeToolCalling,
      structuredOutputs,
      parallelToolCalls,
      extendedThinking,
      streaming
    },
    knownFailureModes: profile.knownFailureModes,
    recommendedSanitizers: getRecommendedSanitizers(profile.knownFailureModes),
    source
  };
}
function createRunEvent(kind, input) {
  return {
    kind,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    ...input
  };
}
var ToolCallValidationError = class extends Error {
  kind = "tool-call-validation";
  reason;
  toolName;
  attemptedArgs;
  validationIssues;
  requestId;
  constructor(input) {
    super(createValidationMessage(input.reason, input.toolName, input.requestId));
    this.name = "ToolCallValidationError";
    this.reason = input.reason;
    this.toolName = input.toolName;
    this.attemptedArgs = input.attemptedArgs;
    this.validationIssues = input.validationIssues ?? [];
    this.requestId = input.requestId;
  }
};
async function validateToolCallRequests(requests, option) {
  if (option === void 0) return;
  const onFailure = option.onFailure ?? "throw";
  if (onFailure === "callback" && option.onValidationFailure === void 0) throw new Error('validateToolCalls.onValidationFailure is required when onFailure is "callback".');
  const toolsByName = new Map(option.tools.map((tool) => [tool.name, tool]));
  const validCalls = [];
  for (const request of requests) {
    const tool = toolsByName.get(request.name);
    if (tool === void 0) {
      await handleValidationError(new ToolCallValidationError({
        reason: "unknown_tool",
        toolName: request.name,
        attemptedArgs: request.args,
        requestId: request.id
      }), onFailure, option.onValidationFailure);
      continue;
    }
    const validation = await validateSchemaOutput(tool.name, tool.inputSchema, request.args);
    if (!validation.ok) {
      await handleValidationError(new ToolCallValidationError({
        reason: "invalid_args",
        toolName: request.name,
        attemptedArgs: request.args,
        validationIssues: validation.issue.issues,
        requestId: request.id
      }), onFailure, option.onValidationFailure);
      continue;
    }
    const extraFields = option.allowExtraFields === true ? [] : findExtraFields(tool.inputSchema, request.args);
    if (extraFields.length > 0) {
      await handleValidationError(new ToolCallValidationError({
        reason: "extra_fields",
        toolName: request.name,
        attemptedArgs: request.args,
        validationIssues: extraFields.map((field) => ({
          message: `Unexpected tool argument field "${field}".`,
          path: [field]
        })),
        requestId: request.id
      }), onFailure, option.onValidationFailure);
      continue;
    }
    validCalls.push({
      id: request.id,
      name: request.name,
      args: validation.value
    });
  }
  return validCalls;
}
async function handleValidationError(error, onFailure, callback) {
  if (onFailure === "throw") throw error;
  if (onFailure === "callback") await callback?.(error);
}
function findExtraFields(schema, value) {
  if (!isRecord(value)) return [];
  const allowedFields = getObjectSchemaKeys(schema);
  if (allowedFields === void 0) return [];
  const allowed = new Set(allowedFields);
  return Object.keys(value).filter((field) => !allowed.has(field));
}
function getObjectSchemaKeys(schema) {
  const candidate = schema;
  const directShape = normalizeShape(candidate.shape);
  if (directShape !== void 0) return directShape;
  if (candidate.def?.type === "object") {
    const defShape = normalizeShape(candidate.def.shape);
    if (defShape !== void 0) return defShape;
  }
  if (candidate._def?.type === "object") return normalizeShape(candidate._def.shape);
}
function normalizeShape(shape) {
  const resolved = typeof shape === "function" ? shape() : shape;
  if (!isRecord(resolved)) return;
  return Object.keys(resolved);
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function createValidationMessage(reason, toolName, requestId) {
  if (reason === "unknown_tool") return `Unknown tool call "${toolName}" (${requestId}).`;
  if (reason === "extra_fields") return `Tool call "${toolName}" contains unexpected argument fields (${requestId}).`;
  return `Invalid arguments for tool call "${toolName}" (${requestId}).`;
}
async function applyOutputSanitizers(rawOutputs, sanitizeOutput, context) {
  if (sanitizeOutput === void 0) return rawOutputs;
  const sanitizers = Array.isArray(sanitizeOutput) ? sanitizeOutput : [sanitizeOutput];
  const sanitizedEntries = await Promise.all(Object.entries(rawOutputs).map(async ([outputName, value]) => {
    if (typeof value !== "string") return [outputName, value];
    let sanitized = value;
    const sanitizerContext = {
      ...context,
      outputName
    };
    for (const sanitizer of sanitizers) sanitized = await sanitizer(sanitized, sanitizerContext);
    return [outputName, sanitized];
  }));
  return Object.fromEntries(sanitizedEntries);
}
function createOpenAICompatibleProvider(options) {
  const id = options.id ?? "openai-compatible";
  const fetchImpl = options.fetch ?? fetch;
  const negotiate = async (modelId) => {
    return synthesizeNegotiatedCapabilitiesFromRegistry(id, modelId, "registry");
  };
  return {
    id,
    kind: "provider-adapter",
    quirks: {
      supportsToolChoice: false,
      parallelToolCalls: false,
      structuredOutputs: false,
      responseFormatHonored: false,
      streamingDiverges: true
    },
    negotiateCapabilities: negotiate,
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
      const sanitizedOutputs = await applyOutputSanitizers(Object.fromEntries(request.outputs.map((name) => [name, text])), options.sanitizeOutput, {
        providerId: id,
        modelId: options.model
      });
      const parsedToolCalls = parseToolUseEnvelope(text);
      const toolCalls = parsedToolCalls === null ? void 0 : await validateToolCallRequests(parsedToolCalls, options.validateToolCalls);
      const usage = normalizeUsage(body.usage);
      const normalizedUsage = normalizeUsageToRunUsage(body.usage, options.pricing);
      return {
        rawOutputs: sanitizedOutputs,
        ...usage !== void 0 ? { usage } : {},
        normalizedUsage,
        ...toolCalls !== void 0 ? { toolCalls } : {},
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
function emitFallbackEvent$1(sink, payload) {
  if (sink === void 0) return;
  sink(createRunEvent("capabilities.negotiation.fallback", {
    runId: `negotiate-${payload.adapter}-${payload.modelId}`,
    providerId: payload.adapter,
    modelId: payload.modelId,
    metadata: {
      adapter: payload.adapter,
      modelId: payload.modelId,
      errorReason: payload.errorReason,
      fallbackSource: payload.fallbackSource
    }
  }));
}
function stringifyErr$3(err) {
  return err instanceof Error ? err.message : String(err);
}
function mergeOpenAIModelsWithRegistry(modelId, body, emitFallback) {
  const data = body?.data;
  if ((Array.isArray(data) ? data.find((m) => typeof m === "object" && m !== null && m.id === modelId) : void 0) === void 0) {
    emitFallback();
    return synthesizeNegotiatedCapabilitiesFromRegistry("openai", modelId, "registry-fallback");
  }
  const registryProfile = getCapabilityProfile(`openai:${modelId}`);
  if (registryProfile !== void 0) return mapProfileToNegotiatedCapabilities(registryProfile, "live");
  return {
    modelId,
    contextWindow: 0,
    supports: {
      nativeToolCalling: false,
      structuredOutputs: false,
      parallelToolCalls: false,
      extendedThinking: false,
      streaming: true
    },
    knownFailureModes: [],
    recommendedSanitizers: [],
    source: "live"
  };
}
function createOpenAIProvider(options) {
  const id = options.id ?? "openai";
  const fetchImpl = options.fetch ?? fetch;
  const baseUrl = (options.baseUrl ?? "https://api.openai.com").replace(/\/$/u, "");
  const ttlMs = options.modelsCacheTtlMs ?? 3e5;
  const retryCount = options.modelsRetryCount ?? 2;
  const cache = /* @__PURE__ */ new Map();
  const inflight = /* @__PURE__ */ new Map();
  async function fetchAndNegotiate(modelId) {
    const url = `${baseUrl}/v1/models`;
    const headers = {
      "accept": "application/json",
      ...options.apiKey !== void 0 ? { authorization: `Bearer ${options.apiKey}` } : {}
    };
    const attempts = retryCount + 1;
    const backoffMs = [
      0,
      200,
      1e3
    ];
    let lastErr;
    for (let i = 0; i < attempts; i += 1) {
      if (i > 0) {
        const delay = backoffMs[Math.min(i, backoffMs.length - 1)] ?? 1e3;
        await new Promise((r) => setTimeout(r, delay));
      }
      try {
        const resp = await fetchImpl(url, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(3e4)
        });
        if (resp.status === 401 || resp.status === 403) throw new NegotiationAuthError("openai", modelId, resp.status, `OpenAI /v1/models returned ${resp.status}: check apiKey config.`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return mergeOpenAIModelsWithRegistry(modelId, await resp.json(), () => {
          emitFallbackEvent$1(options.runEventSink, {
            adapter: "openai",
            modelId,
            errorReason: "model not found in /v1/models response",
            fallbackSource: "registry-fallback"
          });
        });
      } catch (err) {
        if (err instanceof NegotiationAuthError) throw err;
        lastErr = err;
      }
    }
    emitFallbackEvent$1(options.runEventSink, {
      adapter: "openai",
      modelId,
      errorReason: stringifyErr$3(lastErr),
      fallbackSource: "registry-fallback"
    });
    return synthesizeNegotiatedCapabilitiesFromRegistry("openai", modelId, "registry-fallback");
  }
  async function negotiate(modelId) {
    const cached = cache.get(modelId);
    if (cached !== void 0 && cached.expiresAt > Date.now()) return cached.result;
    const existing = inflight.get(modelId);
    if (existing !== void 0) return existing;
    const fetchPromise = (async () => {
      try {
        const result = await fetchAndNegotiate(modelId);
        if (ttlMs > 0) cache.set(modelId, {
          result,
          expiresAt: Date.now() + ttlMs
        });
        return result;
      } finally {
        inflight.delete(modelId);
      }
    })();
    inflight.set(modelId, fetchPromise);
    return fetchPromise;
  }
  return {
    ...createOpenAICompatibleProvider({
      ...options,
      id,
      baseUrl
    }),
    quirks: {
      supportsToolChoice: true,
      parallelToolCalls: true,
      structuredOutputs: true,
      responseFormatHonored: true,
      streamingDiverges: false,
      strictModeSupported: true,
      structuredOutputsTier2: true
    },
    negotiateCapabilities: negotiate
  };
}
var DEFAULT_BASE_URL$1 = "https://api.anthropic.com";
var DEFAULT_ANTHROPIC_VERSION = "2023-06-01";
var DEFAULT_MAX_TOKENS = 2e3;
var DEFAULT_MODELS_CACHE_TTL_MS = 3e5;
var DEFAULT_MODELS_RETRY_COUNT = 2;
var MODELS_BACKOFF_MS = [
  0,
  200,
  1e3
];
function createAnthropicProvider(options) {
  const id = options.id ?? "anthropic";
  const fetchImpl = options.fetch ?? fetch;
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL$1).replace(/\/$/u, "");
  const anthropicVersion = options.anthropicVersion ?? DEFAULT_ANTHROPIC_VERSION;
  const ttlMs = options.modelsCacheTtlMs ?? DEFAULT_MODELS_CACHE_TTL_MS;
  const retryCount = options.modelsRetryCount ?? DEFAULT_MODELS_RETRY_COUNT;
  const cache = /* @__PURE__ */ new Map();
  const inflight = /* @__PURE__ */ new Map();
  function emitFallbackEvent2(payload) {
    if (options.runEventSink === void 0) return;
    const event = createRunEvent("capabilities.negotiation.fallback", {
      runId: `negotiate-${id}-${payload.modelId}`,
      providerId: id,
      modelId: payload.modelId,
      metadata: {
        adapter: payload.adapter,
        modelId: payload.modelId,
        errorReason: payload.errorReason,
        fallbackSource: payload.fallbackSource
      }
    });
    options.runEventSink(event);
  }
  function stringifyErr2(err) {
    return err instanceof Error ? err.message : String(err);
  }
  function mergeAnthropicModelsWithRegistry(modelId, body) {
    const found = body?.data?.find?.((m) => {
      if (typeof m !== "object" || m === null) return false;
      return m["id"] === modelId;
    });
    if (found === void 0) {
      emitFallbackEvent2({
        adapter: "anthropic",
        modelId,
        errorReason: "model not found in /v1/models response",
        fallbackSource: "registry-fallback"
      });
      return synthesizeNegotiatedCapabilitiesFromRegistry("anthropic", modelId, "registry-fallback");
    }
    const caps = found["capabilities"] ?? {};
    const structuredOutputsSupported = caps["structured_outputs"]?.["supported"] === true;
    const thinkingSupported = caps["thinking"]?.["supported"] === true;
    const maxInputTokensRaw = found["max_input_tokens"];
    const maxInputTokens = typeof maxInputTokensRaw === "number" && maxInputTokensRaw > 0 ? maxInputTokensRaw : void 0;
    const registryProfile = getCapabilityProfile(`anthropic:${modelId}`);
    const contextWindow = maxInputTokens ?? registryProfile?.contextWindow ?? 0;
    const knownFailureModes = registryProfile?.knownFailureModes ?? [];
    return {
      modelId,
      contextWindow,
      supports: {
        nativeToolCalling: true,
        structuredOutputs: structuredOutputsSupported,
        parallelToolCalls: true,
        extendedThinking: thinkingSupported,
        streaming: true
      },
      knownFailureModes,
      recommendedSanitizers: getRecommendedSanitizers(knownFailureModes),
      source: "live"
    };
  }
  async function fetchAndNegotiate(modelId) {
    const url = `${baseUrl}/v1/models?limit=1000`;
    const headers = {
      "x-api-key": options.apiKey,
      "anthropic-version": anthropicVersion,
      "accept": "application/json"
    };
    const attempts = retryCount + 1;
    let lastErr;
    for (let i = 0; i < attempts; i += 1) {
      const delayMs = MODELS_BACKOFF_MS[i] ?? MODELS_BACKOFF_MS[MODELS_BACKOFF_MS.length - 1];
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      try {
        const resp = await fetchImpl(url, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(3e4)
        });
        if (resp.status === 401 || resp.status === 403) throw new NegotiationAuthError("anthropic", modelId, resp.status, `Anthropic /v1/models returned ${resp.status}: check apiKey config.`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return mergeAnthropicModelsWithRegistry(modelId, await resp.json());
      } catch (err) {
        if (err instanceof NegotiationAuthError) throw err;
        lastErr = err;
      }
    }
    emitFallbackEvent2({
      adapter: "anthropic",
      modelId,
      errorReason: stringifyErr2(lastErr),
      fallbackSource: "registry-fallback"
    });
    return synthesizeNegotiatedCapabilitiesFromRegistry("anthropic", modelId, "registry-fallback");
  }
  async function negotiateCapabilities(modelId) {
    const cached = cache.get(modelId);
    if (cached !== void 0 && cached.expiresAt > Date.now()) return cached.result;
    const existing = inflight.get(modelId);
    if (existing !== void 0) return existing;
    const fetchPromise = (async () => {
      try {
        const result = await fetchAndNegotiate(modelId);
        if (ttlMs > 0) cache.set(modelId, {
          result,
          expiresAt: ttlMs === Infinity ? Infinity : Date.now() + ttlMs
        });
        return result;
      } finally {
        inflight.delete(modelId);
      }
    })();
    inflight.set(modelId, fetchPromise);
    return fetchPromise;
  }
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
    quirks: {
      supportsToolChoice: true,
      parallelToolCalls: true,
      structuredOutputs: true,
      responseFormatHonored: true,
      streamingDiverges: false,
      promptCachingSupported: true,
      extendedThinkingSupported: true,
      toolUseInputSchemaStrict: true
    },
    negotiateCapabilities,
    async execute(request) {
      const system = request.cacheSystemPrefix !== void 0 ? [{
        type: "text",
        text: request.cacheSystemPrefix,
        cache_control: { type: "ephemeral" }
      }] : "";
      const init = {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": options.apiKey,
          "anthropic-version": anthropicVersion
        },
        body: JSON.stringify({
          model: options.model,
          system,
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
      const sanitizedOutputs = await applyOutputSanitizers(Object.fromEntries(request.outputs.map((name) => [name, text])), options.sanitizeOutput, {
        providerId: id,
        modelId: options.model
      });
      const parsedToolCalls = parseToolUseEnvelope(text);
      const toolCalls = parsedToolCalls === null ? void 0 : await validateToolCallRequests(parsedToolCalls, options.validateToolCalls);
      const usage = normalizeAnthropicUsage(body.usage);
      const normalizedUsage = normalizeAnthropicUsageToRunUsage(body.usage, options.pricing);
      return {
        rawOutputs: sanitizedOutputs,
        ...usage !== void 0 ? { usage } : {},
        normalizedUsage,
        ...toolCalls !== void 0 ? { toolCalls } : {},
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
var GEMINI_QUIRKS = {
  supportsToolChoice: true,
  parallelToolCalls: true,
  structuredOutputs: true,
  responseFormatHonored: true,
  streamingDiverges: false,
  responseSchemaSupported: true,
  safetySettingsConfigurable: true,
  systemInstructionSupported: true
};
function createGeminiProvider(options) {
  const id = options.id ?? "gemini";
  const fetchImpl = options.fetch ?? fetch;
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/u, "");
  const ttlMs = options.modelsCacheTtlMs ?? 3e5;
  const retryCount = options.modelsRetryCount ?? 2;
  const cache = /* @__PURE__ */ new Map();
  const inflight = /* @__PURE__ */ new Map();
  async function negotiate(modelId) {
    const cached = cache.get(modelId);
    if (cached !== void 0 && cached.expiresAt > Date.now()) return cached.result;
    const existing = inflight.get(modelId);
    if (existing !== void 0) return existing;
    const fetchPromise = (async () => {
      try {
        const result = await fetchAndNegotiate(modelId);
        if (ttlMs > 0) cache.set(modelId, {
          result,
          expiresAt: Date.now() + ttlMs
        });
        return result;
      } finally {
        inflight.delete(modelId);
      }
    })();
    inflight.set(modelId, fetchPromise);
    return fetchPromise;
  }
  async function fetchAndNegotiate(modelId) {
    const url = `${baseUrl}/v1beta/models`;
    const headers = {
      "x-goog-api-key": options.apiKey,
      "accept": "application/json"
    };
    const attempts = retryCount + 1;
    const backoffSchedule = [
      0,
      200,
      1e3
    ];
    let lastErr;
    for (let i = 0; i < attempts; i += 1) {
      const delay = backoffSchedule[i] ?? 1e3;
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      try {
        const resp = await fetchImpl(url, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(3e4)
        });
        if (resp.status === 401 || resp.status === 403) throw new NegotiationAuthError("gemini", modelId, resp.status, `Gemini /v1beta/models returned ${resp.status}: check apiKey config.`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return mergeGeminiModelsWithRegistry(modelId, await resp.json());
      } catch (err) {
        if (err instanceof NegotiationAuthError) throw err;
        lastErr = err;
      }
    }
    emitFallbackEvent2({
      adapter: "gemini",
      modelId,
      errorReason: stringifyErr$2(lastErr),
      fallbackSource: "registry-fallback"
    });
    return synthesizeNegotiatedCapabilitiesFromRegistry("gemini", modelId, "registry-fallback");
  }
  function mergeGeminiModelsWithRegistry(modelId, body) {
    const models = body?.models;
    const found = Array.isArray(models) ? models.find((m) => {
      const rec = m;
      return rec?.name === `models/${modelId}` || rec?.baseModelId === modelId || rec?.name === modelId;
    }) : void 0;
    if (found === void 0) {
      emitFallbackEvent2({
        adapter: "gemini",
        modelId,
        errorReason: "model not found in /v1beta/models response",
        fallbackSource: "registry-fallback"
      });
      return synthesizeNegotiatedCapabilitiesFromRegistry("gemini", modelId, "registry-fallback");
    }
    const foundRec = found;
    const registryProfile = getCapabilityProfile(`gemini:${modelId}`);
    const contextWindow = typeof foundRec.inputTokenLimit === "number" && foundRec.inputTokenLimit > 0 ? foundRec.inputTokenLimit : registryProfile?.contextWindow ?? 0;
    const extendedThinking = foundRec.thinking === true;
    const methods = Array.isArray(foundRec.supportedGenerationMethods) ? foundRec.supportedGenerationMethods.map(String) : [];
    const streaming = methods.includes("streamGenerateContent");
    const nativeToolCalling = methods.includes("generateContent") || methods.length > 0;
    const structuredOutputs = true;
    const parallelToolCalls = true;
    const knownFailureModes = registryProfile?.knownFailureModes ?? [];
    const recommendedSanitizers = getRecommendedSanitizers(knownFailureModes);
    return {
      modelId,
      contextWindow,
      supports: {
        nativeToolCalling,
        structuredOutputs,
        parallelToolCalls,
        extendedThinking,
        streaming
      },
      knownFailureModes,
      recommendedSanitizers,
      source: "live"
    };
  }
  function emitFallbackEvent2(payload) {
    if (options.runEventSink === void 0) return;
    const event = createRunEvent("capabilities.negotiation.fallback", {
      runId: `negotiate-gemini-${payload.modelId}`,
      providerId: id,
      modelId: payload.modelId,
      metadata: {
        adapter: payload.adapter,
        modelId: payload.modelId,
        errorReason: payload.errorReason,
        fallbackSource: payload.fallbackSource
      }
    });
    options.runEventSink(event);
  }
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
    quirks: GEMINI_QUIRKS,
    negotiateCapabilities: negotiate,
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
      const sanitizedOutputs = await applyOutputSanitizers(Object.fromEntries(request.outputs.map((name) => [name, text])), options.sanitizeOutput, {
        providerId: id,
        modelId: options.model
      });
      const parsedToolCalls = parseToolUseEnvelope(text);
      const toolCalls = parsedToolCalls === null ? void 0 : await validateToolCallRequests(parsedToolCalls, options.validateToolCalls);
      const usage = normalizeGeminiUsage(body.usageMetadata);
      const normalizedUsage = normalizeGeminiUsageToRunUsage(body.usageMetadata, options.pricing);
      return {
        rawOutputs: sanitizedOutputs,
        ...usage !== void 0 ? { usage } : {},
        normalizedUsage,
        ...toolCalls !== void 0 ? { toolCalls } : {},
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
function stringifyErr$2(err) {
  return err instanceof Error ? err.message : String(err);
}
var DEFAULT_LM_STUDIO_BASE_URL = "http://localhost:1234/v1";
function createLmStudioProvider(options) {
  const resolvedId = options.id ?? "lm-studio";
  const resolvedBaseUrl = options.baseUrl ?? DEFAULT_LM_STUDIO_BASE_URL;
  const negotiate = async (modelId) => {
    return synthesizeNegotiatedCapabilitiesFromRegistry("lm-studio", modelId, "registry");
  };
  return {
    ...createOpenAICompatibleProvider({
      ...options,
      id: resolvedId,
      baseUrl: resolvedBaseUrl
    }),
    quirks: {
      supportsToolChoice: false,
      parallelToolCalls: false,
      structuredOutputs: false,
      responseFormatHonored: false,
      streamingDiverges: true,
      customChatTemplateRiskFlag: true,
      noAuthRequired: true
    },
    negotiateCapabilities: negotiate
  };
}
var DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
var OPENROUTER_QUIRKS = {
  supportsToolChoice: true,
  parallelToolCalls: true,
  structuredOutputs: true,
  responseFormatHonored: true,
  streamingDiverges: false,
  providerRoutingArraySupported: true,
  floorPricingHints: true,
  allowFallbacks: true
};
function createOpenRouterProvider(options) {
  const baseUrl = (options.baseUrl ?? DEFAULT_OPENROUTER_BASE_URL).replace(/\/$/u, "");
  const fetchImpl = options.fetch ?? fetch;
  const ttlMs = options.modelsCacheTtlMs ?? 3e5;
  const retryCount = options.modelsRetryCount ?? 2;
  const cache = /* @__PURE__ */ new Map();
  const inflight = /* @__PURE__ */ new Map();
  async function negotiate(modelId) {
    const cached = cache.get(modelId);
    if (cached !== void 0 && cached.expiresAt > Date.now()) return cached.result;
    const existing = inflight.get(modelId);
    if (existing !== void 0) return existing;
    const fetchPromise = (async () => {
      try {
        const result = await fetchAndNegotiate(modelId);
        if (ttlMs > 0) cache.set(modelId, {
          result,
          expiresAt: Date.now() + ttlMs
        });
        return result;
      } finally {
        inflight.delete(modelId);
      }
    })();
    inflight.set(modelId, fetchPromise);
    return fetchPromise;
  }
  async function fetchAndNegotiate(modelId) {
    const url = `${baseUrl}/api/v1/models`;
    const headers = { "accept": "application/json" };
    const attempts = retryCount + 1;
    const backoffSchedule = [
      0,
      200,
      1e3
    ];
    let lastErr;
    for (let i = 0; i < attempts; i += 1) {
      const delay = backoffSchedule[i] ?? 1e3;
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      try {
        const resp = await fetchImpl(url, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(3e4)
        });
        if (resp.status === 401 || resp.status === 403) throw new NegotiationAuthError("openrouter", modelId, resp.status, `OpenRouter /api/v1/models returned ${resp.status}.`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return mergeOpenRouterModelsWithRegistry(modelId, await resp.json());
      } catch (err) {
        if (err instanceof NegotiationAuthError) throw err;
        lastErr = err;
      }
    }
    emitFallbackEvent2({
      adapter: "openrouter",
      modelId,
      errorReason: stringifyErr$1(lastErr),
      fallbackSource: "registry-fallback"
    });
    return synthesizeNegotiatedCapabilitiesFromRegistry("openrouter", modelId, "registry-fallback");
  }
  function mergeOpenRouterModelsWithRegistry(modelId, body) {
    const rows = body?.data;
    const found = Array.isArray(rows) ? rows.find((m) => {
      const rec = m;
      if (typeof rec?.id !== "string") return false;
      const rowId = rec.id;
      if (rowId === modelId || rowId === stripOpenRouterVariant(modelId)) return true;
      const strippedModelId = stripOpenRouterVariant(modelId);
      return stripOpenRouterVariant(rowId) === strippedModelId;
    }) : void 0;
    const stripped = stripOpenRouterVariant(modelId);
    const registryProfile = getCapabilityProfile(`openrouter:${stripped}`);
    if (found === void 0) {
      emitFallbackEvent2({
        adapter: "openrouter",
        modelId,
        errorReason: "model not found in /api/v1/models response",
        fallbackSource: "registry-fallback"
      });
      return {
        ...synthesizeNegotiatedCapabilitiesFromRegistry("openrouter", stripped, "registry-fallback"),
        modelId
      };
    }
    const foundRec = found;
    const topProvider = foundRec.top_provider;
    const contextWindow = typeof topProvider?.context_length === "number" && topProvider.context_length > 0 ? topProvider.context_length : typeof foundRec.context_length === "number" && foundRec.context_length > 0 ? foundRec.context_length : registryProfile?.contextWindow ?? 0;
    const supportedParams = Array.isArray(foundRec.supported_parameters) ? foundRec.supported_parameters.map(String) : [];
    const nativeToolCalling = supportedParams.includes("tools");
    const structuredOutputs = supportedParams.includes("response_format");
    const parallelToolCalls = supportedParams.includes("tool_choice");
    const extendedThinking = supportedParams.includes("reasoning") || supportedParams.includes("thinking");
    const streaming = true;
    const knownFailureModes = registryProfile?.knownFailureModes ?? [];
    const recommendedSanitizers = getRecommendedSanitizers(knownFailureModes);
    return {
      modelId,
      contextWindow,
      supports: {
        nativeToolCalling,
        structuredOutputs,
        parallelToolCalls,
        extendedThinking,
        streaming
      },
      knownFailureModes,
      recommendedSanitizers,
      source: "live"
    };
  }
  function emitFallbackEvent2(payload) {
    if (options.runEventSink === void 0) return;
    const event = createRunEvent("capabilities.negotiation.fallback", {
      runId: `negotiate-openrouter-${payload.modelId}`,
      providerId: options.id ?? "openrouter",
      modelId: payload.modelId,
      metadata: {
        adapter: payload.adapter,
        modelId: payload.modelId,
        errorReason: payload.errorReason,
        fallbackSource: payload.fallbackSource
      }
    });
    options.runEventSink(event);
  }
  return {
    ...createOpenAICompatibleProvider({
      ...options,
      id: options.id ?? "openrouter",
      baseUrl
    }),
    quirks: OPENROUTER_QUIRKS,
    negotiateCapabilities: negotiate
  };
}
function stringifyErr$1(err) {
  return err instanceof Error ? err.message : String(err);
}
var DEFAULT_XAI_BASE_URL = "https://api.x.ai/v1";
function emitFallbackEvent(sink, payload) {
  if (sink === void 0) return;
  sink(createRunEvent("capabilities.negotiation.fallback", {
    runId: `negotiate-${payload.adapter}-${payload.modelId}`,
    providerId: payload.adapter,
    modelId: payload.modelId,
    metadata: {
      adapter: payload.adapter,
      modelId: payload.modelId,
      errorReason: payload.errorReason,
      fallbackSource: payload.fallbackSource
    }
  }));
}
function stringifyErr(err) {
  return err instanceof Error ? err.message : String(err);
}
function mergeXaiModelsWithRegistry(modelId, body, emitFallback) {
  const rawData = body?.data;
  if (!Array.isArray(rawData)) {
    emitFallback();
    return synthesizeNegotiatedCapabilitiesFromRegistry("xai", modelId, "registry-fallback");
  }
  if (rawData.find((m) => typeof m === "object" && m !== null && m.id === modelId) === void 0) {
    emitFallback();
    return synthesizeNegotiatedCapabilitiesFromRegistry("xai", modelId, "registry-fallback");
  }
  const registryProfile = getCapabilityProfile(`xai:${modelId}`);
  if (registryProfile !== void 0) return mapProfileToNegotiatedCapabilities(registryProfile, "live");
  return synthesizeNegotiatedCapabilitiesFromRegistry("xai", modelId, "registry-fallback");
}
function createXaiProvider(options) {
  const resolvedBaseUrl = (options.baseUrl ?? DEFAULT_XAI_BASE_URL).replace(/\/$/u, "");
  const ttlMs = options.modelsCacheTtlMs ?? 3e5;
  const retryCount = options.modelsRetryCount ?? 2;
  const fetchImpl = options.fetch ?? fetch;
  const cache = /* @__PURE__ */ new Map();
  const inflight = /* @__PURE__ */ new Map();
  async function fetchAndNegotiate(modelId) {
    const url = `${resolvedBaseUrl}/models`;
    const headers = {
      "accept": "application/json",
      ...options.apiKey !== void 0 ? { authorization: `Bearer ${options.apiKey}` } : {}
    };
    const attempts = retryCount + 1;
    const backoffMs = [
      0,
      200,
      1e3
    ];
    let lastErr;
    for (let i = 0; i < attempts; i += 1) {
      if (i > 0) {
        const delay = backoffMs[Math.min(i, backoffMs.length - 1)] ?? 1e3;
        await new Promise((r) => setTimeout(r, delay));
      }
      try {
        const resp = await fetchImpl(url, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(3e4)
        });
        if (resp.status === 401 || resp.status === 403) throw new NegotiationAuthError("xai", modelId, resp.status, `xAI /v1/models returned ${resp.status}: check apiKey config.`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return mergeXaiModelsWithRegistry(modelId, await resp.json(), () => {
          emitFallbackEvent(options.runEventSink, {
            adapter: "xai",
            modelId,
            errorReason: "model not found in /v1/models response or unexpected body shape",
            fallbackSource: "registry-fallback"
          });
        });
      } catch (err) {
        if (err instanceof NegotiationAuthError) throw err;
        lastErr = err;
      }
    }
    emitFallbackEvent(options.runEventSink, {
      adapter: "xai",
      modelId,
      errorReason: stringifyErr(lastErr),
      fallbackSource: "registry-fallback"
    });
    return synthesizeNegotiatedCapabilitiesFromRegistry("xai", modelId, "registry-fallback");
  }
  async function negotiate(modelId) {
    const cached = cache.get(modelId);
    if (cached !== void 0 && cached.expiresAt > Date.now()) return cached.result;
    const existing = inflight.get(modelId);
    if (existing !== void 0) return existing;
    const fetchPromise = (async () => {
      try {
        const result = await fetchAndNegotiate(modelId);
        if (ttlMs > 0) cache.set(modelId, {
          result,
          expiresAt: Date.now() + ttlMs
        });
        return result;
      } finally {
        inflight.delete(modelId);
      }
    })();
    inflight.set(modelId, fetchPromise);
    return fetchPromise;
  }
  const inner = createOpenAICompatibleProvider({
    ...options,
    id: options.id ?? "xai",
    baseUrl: resolvedBaseUrl
  });
  const innerExecute = inner.execute;
  const wrappedExecute = innerExecute === void 0 ? void 0 : async (request) => {
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
  };
  return {
    id: inner.id,
    kind: inner.kind,
    quirks: {
      supportsToolChoice: true,
      parallelToolCalls: true,
      structuredOutputs: true,
      responseFormatHonored: true,
      streamingDiverges: false,
      reasoningTokensReported: true,
      logprobsSupported: false
    },
    negotiateCapabilities: negotiate,
    ...inner.capabilities !== void 0 ? { capabilities: inner.capabilities } : {},
    ...wrappedExecute !== void 0 ? { execute: wrappedExecute } : {}
  };
}
var textEncoder2 = new TextEncoder();

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
(async () => {
  const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
  signer = createInMemorySigner(privateKeyJwk, { kid: "fsb-offscreen-ephemeral", publicKeyJwk });
  console.log(HOST_TAG, "ephemeral signer ready");
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
    if (!signer) {
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
    const pipeline = createHookPipeline();
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
