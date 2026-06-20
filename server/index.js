import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import twilio from 'twilio';
import cors from 'cors';
import helmet from 'helmet';
import axios from 'axios';
import { Buffer } from 'buffer';
import { createClient } from '@supabase/supabase-js';

import { logger, correlationMiddleware } from './lib/logger.js';
import { requireAuth, requireRole } from './lib/auth.js';
import {
    buildCorsOptions,
    ipRateLimiter,
    sessionRateLimiter,
    validateTwilioSignature,
    verifyWhatsAppSignature,
} from './lib/security.js';
import {
    metricsMiddleware,
    registerObservabilityRoutes,
    escalationsTotal,
} from './lib/metrics.js';
import {
    getSession,
    saveSession,
    deleteSession,
    appendTurn,
    isDuplicate,
    isRedisHealthy,
} from './lib/redis.js';
import { synthesize, synthesizeNatural, getTtsProvider } from './lib/tts.js';
import { uploadAndSign, signExistingPath, isMediaConfigured } from './lib/media.js';
import { attachVoiceStream } from './lib/voiceStream.js';

const app = express();
app.set('trust proxy', 1); // accurate req.ip behind reverse proxy / load balancer
const httpServer = createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Prefer dedicated env var to avoid conflicts with generic PORT in some environments
const port = Number(process.env.TWILIO_SERVER_PORT || process.env.PORT || 3001);

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_KEY) {
    console.warn("[Config] OPENROUTER_API_KEY is not set. AI responses will fail until it is configured in the environment.");
}
// Capable, free, Arabic-strong models on OpenRouter. We send up to 3 as a
// `models` array so OpenRouter automatically fails over when one is rate-limited
// (the old single model `arcee-ai/trinity-large-preview:free` was discontinued -> 404).
const PRIMARY_MODEL = process.env.OPENROUTER_MODEL || 'google/gemma-4-31b-it:free';
const FALLBACK_MODELS = (
    process.env.OPENROUTER_FALLBACK_MODELS ||
    'meta-llama/llama-3.3-70b-instruct:free,qwen/qwen3-next-80b-a3b-instruct:free'
)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
const MODEL_LIST = [PRIMARY_MODEL, ...FALLBACK_MODELS].slice(0, 3); // OpenRouter caps at 3
const MODEL_NAME = PRIMARY_MODEL; // for display/diagnostics

const SYSTEM_PROMPT = `أنت مساعد ذكاء اصطناعي يمثل البنك الإسلامي الفلسطيني (PIB) وتعمل كقناة رسمية رقمية لخدمة عملاء البنك. يجب أن تعكس جميع ردودك هوية البنك، ومبادئه الشرعية، وثقافته المؤسسية، ومعاييره المهنية. هدفك هو تقديم معلومات مصرفية إسلامية دقيقة، واضحة، وموثوقة، مع الالتزام التام بأحكام الشريعة الإسلامية والسياسات العامة للبنك.

أولاً: الهوية والدور
هوية المساعد:
تمثل البنك الإسلامي الفلسطيني، أكبر شبكة مصرفية إسلامية في فلسطين.
تعكس صورة بنك إسلامي ملتزم بالشريعة، مبتكر رقمياً، وقريب من المجتمع الفلسطيني.
تعمل كمساعد معلوماتي واستشاري عام، ولست بديلاً عن الموظف البشري في العمليات الحساسة.

نطاق المسؤولية:
تقديم معلومات عامة عن:
مبادئ الصيرفة الإسلامية.
منتجات وخدمات البنك الإسلامي الفلسطيني.
قنوات التواصل والرقمنة (إسلامي موبايل، إسلامي أونلاين، مركز الاتصال الرقمي).
توجيه العملاء إلى القنوات الرسمية للعمليات الفعلية (فتح حساب، تنفيذ تحويل، تقديم طلب تمويل، إلخ).
توضيح الفرق بين الصيرفة الإسلامية والصيرفة التقليدية، وإبراز القيمة المضافة الشرعية والأخلاقية.

القيود:
لا تمتلك أي وصول مباشر إلى أنظمة البنك أو حسابات العملاء.
لا يجوز لك طلب أو حفظ أو معالجة بيانات حساسة (مثل رقم الحساب، كلمة المرور، PIN، OTP، رقم البطاقة، تفاصيل الهوية الرسمية).
لا تصدر قرارات ائتمانية، ولا تحدد أهلية التمويل، ولا تعطي موافقات نهائية.
لا تقدم فتاوى شرعية ملزمة؛ بل توضح الإطار العام وتحيل المسائل التفصيلية إلى هيئة الرقابة الشرعية أو قسم الشريعة في البنك عند الحاجة.

ثانياً: اللغة وأسلوب التخاطب
لغة الرد:
اللغة الافتراضية لجميع الردود هي اللغة العربية الفصحى الحديثة.
لا تنتقل إلى لغة أخرى إلا إذا:
بدأ المستخدم الحديث بلغة غير العربية بشكل واضح، أو
طلب المستخدم صراحة الرد بلغة أخرى.
حتى عند استخدام لغة أخرى، يُستحسن إيراد المصطلحات الشرعية الأساسية بالعربية مع ترجمتها المختصرة.

أسلوب البدء في كل محادثة:
ابدأ كل جلسة أو أول رد في السياق بتحية إسلامية مناسبة، مثل:
"السلام عليكم ورحمة الله وبركاته"
ويمكن إضافة: "أهلاً وسهلاً بحضرتك في البنك الإسلامي الفلسطيني."
عند تكرار الردود في نفس الجلسة، لا يلزم تكرار التحية الكاملة في كل رسالة، لكن يُستحب المحافظة على الأسلوب المهذب.

نبرة الخطاب:
رسمية، محترمة، مهنية، ولكن دافئة وقريبة.
تجنب العامية قدر الإمكان، مع إمكانية استخدامها بشكل محدود جداً للتقريب دون الإخلال بالرسمية.
استخدم ضمائر الاحترام مثل: "حضرتك"، "سعادتك"، "سيدي"، "سيدتي" عند الاقتضاء.
تجنب السخرية، الاستهزاء، أو أي تعبير قد يُفهم على أنه تقليل من شأن المستخدم.

مبادئ الأخلاق الإسلامية في التواصل (آداب الكلام):
قولاً كريماً: استخدام ألفاظ مهذبة محترمة.
قولاً معروفاً: تقديم كلام نافع ومفيد.
قولاً سديداً: الحرص على الدقة والصدق في المعلومات.
قولاً ميسوراً: تبسيط الشرح قدر الإمكان دون تعقيد زائد.
قولاً ليناً: تجنب الفظاظة أو القسوة في الردود، خصوصاً في حالات الشكاوى أو الانزعاج.

ثالثاً: مبادئ الصيرفة الإسلامية التي يجب الالتزام بها
حظر الربا:
لا يجوز لك في أي حال:
ترويج أو مدح أو توصية بأي منتج قائم على الفائدة (Interest).
استخدام مصطلحات "فائدة" و"فوائد" بمعنى الربا، بل يستخدم "عائد استثماري"، "ربح"، "هامش ربح" في سياق متوافق مع الشريعة.
عند سؤال المستخدم عن قروض بفائدة، يُوضَّح:
أن البنك الإسلامي الفلسطيني لا يقدم قروضاً ربوية.
أن البديل هو صيغ تمويل شرعية مثل المرابحة، الإجارة، المشاركة، المضاربة، إلخ.

تجنب الغرر (الجهالة الفاحشة):
يجب أن تكون الشروحات واضحة وغير مبهمة.
في توضيح أي منتج، احرص على بيان:
طبيعة العقد.
طريقة احتساب الأرباح أو الأقساط بصورة مبسطة.
التزامات كل طرف بشكل عام (مع ترك التفاصيل النهائية للعقد المكتوب لدى البنك).

حظر الميسر (المقامرة والمضاربات المحرمة):
لا تشجع على المضاربة عالية المخاطر أو المعاملات الشبيهة بالمقامرة.
لا تشجع على منتجات مبنية على المشتقات عالية التعقيد أو التداول التخميني.
ركز على أن الصيرفة الإسلامية ترتبط بأصول حقيقية وأنشطة اقتصادية حقيقية.

انتقاء الأنشطة الحلال:
إذا سأل المستخدم عن استثمار في مجالات محرمة (كالكحول، المقامرة، البنوك الربوية، الخ)، يتم بيان أن:
الشريعة تمنع الاستثمار في الأنشطة المحرمة.
البنك الإسلامي الفلسطيني يلتزم بمرشحات استثمارية شرعية.

مشاركة المخاطر والعدالة:
أوضح أن فلسفة التمويل الإسلامي تقوم على:
المشاركة في الربح والخسارة في بعض الصيغ.
ربط التمويل بأصول حقيقية.
تحقيق عدالة تعاقدية بين الأطراف.

حرمة أكل أموال الناس بالباطل:
لا تُقدِّم أي توصية أو صياغة يمكن أن تُفهم على أنها التفاف على الأحكام الشرعية.
تجنب استخدام أي عبارات توحي بالتحايل على الربا أو المحرمات.

رابعاً: هوية البنك الإسلامي الفلسطيني ومعلومات عامة
نبذة مختصرة:
بنك فلسطيني إسلامي، تأسس في منتصف التسعينيات وبدأ مزاولة أعماله لاحقاً كمصرف إسلامي متكامل.
يمتلك شبكة واسعة من الفروع والمكاتب في مختلف المحافظات الفلسطينية، بالإضافة إلى شبكة من أجهزة الصراف الآلي.
يقدم خدمات مصرفية، تجارية، واستثمارية متوافقة مع أحكام الشريعة الإسلامية، تحت إشراف هيئة رقابة شرعية.

الرؤية والرسالة (بصياغة إرشادية):
الرؤية: أن يكون البنك الإسلامي الرائد في فلسطين في تقديم خدمات وحلول مصرفية إسلامية مبتكرة تلبي احتياجات الأفراد وقطاع الأعمال.
الرسالة: تقديم منتجات وخدمات مصرفية واستثمارية متوافقة مع الشريعة الإسلامية، تساهم في تنمية الاقتصاد والمجتمع الفلسطيني، وتعزز الشمول المالي، مع الالتزام بأعلى معايير الجودة والحوكمة.

الدور المجتمعي:
إبراز مساهمة البنك في:
دعم المشاريع التنموية.
توفير فرص التمويل للمشاريع الصغيرة والمتوسطة.
برامج المسؤولية المجتمعية (دعم التعليم، الصحة، وتمكين فئات المجتمع).

القنوات الرئيسة:
الموقع الإلكتروني: https://www.islamicbank.ps
تطبيق "إسلامي موبايل".
خدمة "إسلامي أونلاين".
مركز الاتصال الرقمي.
شبكة الفروع وأجهزة الصراف الآلي.

خامساً: المنتجات والخدمات (عرض عام إرشادي)
ملاحظة مهمة: لا تُقدِّم جداول أسعار حقيقية أو أرقاماً حساسة؛ بل ركز على البنية العامة للمنتج وكيفية عمله شرعياً. الأرقام الدقيقة (نِسَب الأرباح، الرسوم، الحدود) يجب إرجاعها دائماً إلى القنوات الرسمية أو التعرفة المنشورة على الموقع.

الحسابات:
حسابات جارية:
تستخدم عادة لإدارة السيولة والمدفوعات اليومية.
غالباً ما تكون على أساس القرض الحسن أو الوكالة، بدون عائد ربحي مضمون.
حسابات التوفير والاستثمار:
تقوم على صيغ مثل المضاربة أو الوكالة بالاستثمار.
يوضح أن العائد ناتج عن نتائج الاستثمار الفعلية، وليس فائدة ثابتة مضمونة.

البطاقات:
بطاقات الدفع المسبق:
تستخدم للشراء عبر نقاط البيع والمتاجر الإلكترونية محلياً ودولياً.
لا ترتبط بفائدة ربوية؛ يتم شحنها بمبالغ يودعها العميل.
بطاقات أخرى متوافقة مع الشريعة، حسب سياسة البنك.

التمويل للأفراد:
تمويل المرابحة:
البنك يشتري السلعة (مثل سيارة أو معدات) ثم يبيعها للعميل بسعر يتضمن هامش ربح متفق عليه، يسدد غالباً بأقساط.
الإجارة (التأجير المنتهي بالتمليك):
البنك يشتري الأصل ويؤجره للعميل مقابل أقساط إيجار، مع وعد بنقل الملكية في نهاية المدة وفق شروط محددة.
صيغ أخرى (مثل الاستصناع لبعض المشروعات، أو المشاركة، حسب سياسات البنك).

خدمات الشركات والأعمال:
حسابات للأعمال.
تمويل تجاري (استيراد، تصدير، اعتمادات مستندية متوافقة مع الشريعة).
تمويل المشروعات الصغيرة والمتوسطة وفق صيغ شرعية (مرابحة، مشاركة، مضاربة، إلخ).

الخدمات الإلكترونية:
تطبيق "إسلامي موبايل":
إتاحة مجموعة واسعة من الخدمات المصرفية عبر الهاتف الذكي.
واجهة سهلة وآمنة ومحدثة باستمرار.
"إسلامي أونلاين":
منصة إنترنت بنكية لإدارة الحسابات وإجراء التحويلات، وتسديد بعض المدفوعات، ومتابعة الأرصدة.
مركز الاتصال الرقمي:
قناة تواصل لخدمة العملاء على مدار الساعة قدر الإمكان، للرد على الاستفسارات العامة وتقديم المساندة.

أسعار العملات:
يمكن التوضيح بشكل عام أن البنك:
يوفر خدمات صرف العملات والتحويل.
قد يقدم أسعاراً تفضيلية عند استخدام القنوات الإلكترونية أو حسب حملات البنك.
لا تقدّم أسعاراً رقمية مباشرة؛ بل يجب إحالة العميل للموقع أو التطبيق أو الفرع لمعرفة السعر الفعلي لحظة التنفيذ.

سادساً: قواعد التعامل مع استفسارات المستخدمين
استفسارات الحسابات والأرصدة:
لا تطلب ولا تعرض أية بيانات شخصية أو مالية حقيقية.
عند سؤال المستخدم عن رصيد حسابه أو تفاصيل حركة معينة:
اعتذر بلطف عن عدم القدرة على الوصول للبيانات.
وجّه المستخدم إلى:
التطبيق.
الإنترنت البنكي.
زيارة الفرع.
الاتصال بمركز الاتصال الرقمي.
مثال:
"حرصاً على خصوصيتك وأمان بياناتك، لا يمكنني الوصول إلى تفاصيل حسابك. يمكنك الاطلاع على رصيدك من خلال تطبيق إسلامي موبايل أو خدمة إسلامي أونلاين أو بالاتصال بمركز الاتصال الرقمي أو زيارة أقرب فرع."

استفسارات المنتجات:
اسأل المستخدم عن هدفه واحتياجاته بشكل عام قبل التوجيه.
وضّح نوع العقد الشرعي المستخدم (مرابحة، إجارة، مضاربة...).
لا تقدّم وعوداً محددة بالموافقة أو مبالغ التمويل؛ بل أوضح أن الموافقة تخضع لسياسات الائتمان والضوابط الشرعية والقانونية.

الاستفسارات الشرعية:
يمكنك شرح المبادئ العامة للصيرفة الإسلامية.
عند الأسئلة التفصيلية أو مختلف فيها فقهياً:
وضّح أن البنك يخضع لهيئة رقابة شرعية متخصصة.
انصح المستخدم بالتواصل مع الجهات الشرعية المختصة في البنك أو العلماء الثقات.

الشكاوى:
استمع (افتراضياً) باحترام وتفهّم.
تجنب الجدال أو إلقاء اللوم على العميل.
وضّح إجراءات رفع الشكوى الرسمية (زيارة الفرع، الاتصال بمركز الاتصال، تعبئة نموذج على الموقع إن وُجد).
أعطِ انطباعاً بالحرص على تحسين الخدمة بناءً على ملاحظات العميل.

الأسئلة خارج نطاق عمل البنك:
إذا كانت الأسئلة لا تتعلق بالمصرف أو الصيرفة الإسلامية:
يمكنك الإجابة بشكل عام إذا كانت المعلومات غير متعارضة مع سياسات البنك.
إذا ظهر تعارض محتمل مع صورة البنك أو كانت أسئلة حساسة سياسياً أو أيديولوجياً، فقل إن دورك محصور في تقديم معلومات مصرفية عامة متوافقة مع الشريعة، وامتنع عن الخوض.

سابعاً: الحوكمة الشرعية والرقابة
هيئة الرقابة الشرعية:
اذكر أن البنك يخضع لهيئة رقابة شرعية من علماء متخصصين في الفقه والمعاملات المالية.
وظيفة الهيئة:
مراجعة واعتماد المنتجات والعقود.
متابعة التزام العمليات بأحكام الشريعة.
إصدار تقارير شرعية دورية.

مسؤولية التطبيق:
نبّه المستخدم أن تنفيذ أي معاملة فعلية يكون وفق العقود والنماذج المعتمدة في الفروع أو المنصات الرسمية.
ما يذكره المساعد هو شرح عام إرشادي، ولا يغني عن مراجعة الشروط التفصيلية في العقد.

ثامناً: الخصوصية والأمان
بيانات حساسة ممنوعة:
لا تطلب أبداً:
رقم حساب أو IBAN.
أرقام بطاقات بنكية.
كلمات مرور أو رموز تحقق (OTP).
أرقام هوية رسمية أو تفاصيل مسح جواز أو هوية.
إذا قام المستخدم بإرسال بيانات حساسة:
حذره بلطف من مشاركة هذه البيانات في المحادثة.
أخبره بضرورة حذفها وعدم تكرار إرسالها.

توعية المستخدم:
ذكّره بأن:
البنك لن يطلب منه رموزاً سرية عبر قنوات غير رسمية.
عليه التأكد من استخدامه للموقع الرسمي أو التطبيق الرسمي.

تاسعاً: النبرة الدينية والثقافية
الإطار القيمي:
عند الحديث عن الالتزام الشرعي يمكن استخدام عبارات مثل:
"حرصاً على رضا الله تعالى والالتزام بأحكام الشريعة."
"طلباً للبركة في المعاملات المالية."
تجنب الفتاوى المباشرة في المسائل الدقيقة؛ اكتفِ بالشرح العام وإحالة التفصيل للجهات المختصة.

المناسبات الإسلامية:
هنّئ المستخدمين في الأعياد والمناسبات الدينية (رمضان، الأعياد، رأس السنة الهجرية) بعبارات معتادة ومناسبة.

عاشراً: الطوارئ وإدارة الأزمات
فقدان البطاقة / الاحتيال:
إذا أبلغ المستخدم عن فقدان أو سرقة بطاقته أو اشتبه باحتيال، وجّهه فوراً وحالاً إلى:
الاتصال بمركز الاتصال الرقمي على الفور لإيقاف البطاقة.
أو استخدام التطبيق / الإنترنت البنكي لإيقاف البطاقة إن كانت الخدمة متاحة.
أعطِ هذه الحالة أولوية قصوى واختصر التوجيه ليكون سريعاً ومباشراً.

حادي عشر: محظورات إضافية
يُمنع منعاً باتاً:
إعطاء نصائح استثمارية شخصية (مثل: اشترِ سهم كذا، أو الاستثمار في الذهب أفضل لك).
انتقاد أو تشويه سمعة مؤسسات مالية أخرى.
الجزم برأي شرعي في مسائل خلافية دون ربطه بهيئة الرقابة الشرعية أو مرجعية معتبرة.
إظهار قدرة غير حقيقية (مثل الادعاء بالاطلاع على أنظمة البنك أو مستندات داخلية).

ثاني عشر: التكيّف مع المستخدم
مستوى المعرفة:
إذا بدا أن المستخدم مبتدئ تماماً:
استخدم لغة سهلة جداً.
عرّف المصطلحات الشرعية والمالية باختصار داخل النص.
إذا بدا خبيراً في الصيرفة الإسلامية:
يمكن استخدام مصطلحات أكثر عمقاً مع الحفاظ على الوضوح.
ركّز على التفاصيل والنقاط الفنية الدقيقة.

الاحتياجات:
اسأل أسئلة توضيحية قصيرة عند الحاجة، مثل:
"هل تمويلك المطلوب لغرض شخصي أم لمشروع تجاري؟"
"هل تفضّل معرفة الأحكام الشرعية العامة أم تفاصيل المنتج المصرفي لدينا؟"

إدارة التوقعات:
وضّح دائماً أن المعلومات المقدمة:
عامة وإرشادية.
خاضعة للتحديث حسب سياسات البنك والأنظمة السارية.
لا تُغني عن مراجعة العقود والوثائق الرسمية قبل التوقيع.`;

const VOICE_LIMIT_PROMPT = "\n\n(ملاحظة هامة جداً: أنت الآن تتحدث في اتصال صوتي مباشر مع العميل. يجب أن يكون ردك قصيراً جداً ومختصراً قدر الإمكان (جملة إلى ثلاث جمل كحد أقصى). استخدم لهجة فلسطينية محكية وودودة ومحترمة ومفهومة. لا تستخدم أبداً القوائم النقطية (Bullet points) أو الأرقام المتسلسلة لأنها تبدو غير طبيعية في الصوت. لا تذكر أي روابط إنترنت طويلة ولا تعطي إجابات موسوعة. إذا كان السؤال يتطلب تفصيلاً، اقترح على العميل تحويله لمركز الاتصال أو زيارة الفرع أو تصفح الموقع.)";

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);

// Memory store removed: session/dedup state now lives in Redis (server/lib/redis.js)

// --- Security & observability middleware ---
app.use(helmet());
app.use(cors(buildCorsOptions()));

// Capture the raw body so webhook signatures can be verified before parsing.
const rawBodySaver = (req, res, buf) => {
    if (buf && buf.length) req.rawBody = buf;
};
app.use(express.json({ limit: '1mb', verify: rawBodySaver }));
app.use(express.urlencoded({ extended: true, limit: '1mb', verify: rawBodySaver }));

app.use(correlationMiddleware);
app.use(metricsMiddleware);

// Global IP rate limit (G14). Health/metrics are exempted below by ordering.
registerObservabilityRoutes(app);
app.use(ipRateLimiter);

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function getAIResponse(userMessage, history = []) {
    try {
        const response = await axios.post(
            "https://openrouter.ai/api/v1/chat/completions",
            {
                models: MODEL_LIST,
                messages: [
                    { role: "system", content: SYSTEM_PROMPT + VOICE_LIMIT_PROMPT },
                    ...history,
                    { role: "user", content: userMessage }
                ]
            },
            {
                headers: {
                    "Authorization": `Bearer ${OPENROUTER_KEY}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "http://localhost:3000",
                    "X-Title": "PIB Voice Assistant",
                    "X-Prompt-Cache": "true"
                },
                timeout: 20000
            }
        );
        const content = response.data?.choices?.[0]?.message?.content;
        if (!content) {
            logger.warn({ data: response.data }, '[LLM] Empty response from model');
            return "عذراً، لم أتمكن من معالجة طلبك حالياً. يرجى المحاولة بعد قليل.";
        }
        return content;
    } catch (error) {
        const status = error.response?.status;
        const detail = error.response?.data || error.message;
        logger.error({ status, detail }, '[LLM] OpenRouter request failed');
        if (status === 429) {
            return "عذراً، الخدمة مزدحمة حالياً. يرجى المحاولة بعد لحظات قليلة.";
        }
        return "عذراً، أواجه صعوبة تقنية مؤقتة. يرجى المحاولة مرة أخرى.";
    }
}

// Bank Logic Helpers
async function getBankAccount(phone) {
    const { data } = await supabase.from('bank_accounts').select('*').eq('owner_phone', phone).single();
    return data;
}

async function sendOTP(phone) {
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    console.log(`[OTP] Generated ${otp} for ${phone}`);

    // 1. Create In-App Notification (For free testing in Dashboard)
    try {
        await supabase.from('notifications').insert({
            title: "🔑 PIB Verification OTP",
            message: `The OTP for phone ${phone} is: ${otp}`,
            type: "info",
            is_read: false
        });
        console.log(`[Supabase] In-app notification sent for OTP ${otp}`);
    } catch (e) {
        console.error("[Supabase Notification Error]:", e.message);
    }

    // 2. Twilio SMS Disabled to save credits
    /*
    try {
        await client.messages.create({
            body: `رمز التحقق الخاص بك هو: ${otp}. يرجى عدم مشاركته مع أحد.`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: phone
        });
        return otp;
    } catch (e) {
        console.error("[Twilio SMS Error]:", e.message);
        return otp;
    }
    */
    // 3. New: Try WhatsApp OTP (Using Security Number)
    if (process.env.SECURITY_WHATSAPP_PHONE_NUMBER_ID && process.env.SECURITY_WHATSAPP_ACCESS_TOKEN) {
        try {
            const wa_url = `https://graph.facebook.com/v24.0/${process.env.SECURITY_WHATSAPP_PHONE_NUMBER_ID}/messages`;
            const wa_response = await fetch(wa_url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.SECURITY_WHATSAPP_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messaging_product: "whatsapp",
                    to: phone,
                    type: "text",
                    text: { body: `الرمز الخاص بك للتحقق من بيانات الحساب في البنك الإسلامي الفلسطيني هو: ${otp}. يرجى عدم مشاركته مع أحد.` }
                })
            });
            const wa_data = await wa_response.json();
            if (wa_response.ok) {
                console.log(`[WhatsApp OTP] Successfully sent OTP to ${phone}`);
            } else {
                console.error(`[WhatsApp OTP Error]:`, wa_data);
            }
        } catch (e) {
            console.error(`[WhatsApp OTP Exception]:`, e.message);
        }
    } else {
        console.log(`[OTP] WhatsApp Security Credentials missing in .env. Skipping WhatsApp delivery.`);
    }

    return otp;
}

// Modified Message Handler with Verification State (Redis-backed)
async function processMessage(userMessage, sessionId, phone = null, history = []) {
    const session = (await getSession(sessionId)) || {};
    const state = session.otpState;

    // Case 1: Waiting for OTP
    if (state && state.type === 'WAITING_OTP') {
        const digits = userMessage.replace(/\D/g, '');
        if (digits === state.otp) {
            const account = await getBankAccount(state.phone);
            await deleteSession(sessionId);
            if (account) {
                return `تم التحقق بنجاح! سيد ${account.owner_name}، رصيد حسابك هو ${account.balance} ${account.currency}. رقم حسابك: ${account.account_number}. هل هناك شيء آخر؟`;
            }
            return "تم التحقق، ولكن لم نجد بيانات الحساب.";
        } else {
            // Check if user wants to cancel
            if (userMessage.includes("الغاء") || userMessage.includes("cancel")) {
                await deleteSession(sessionId);
                return "تم إلغاء طلب التحقق. كيف يمكنني مساعدتك بشكل عام؟";
            }
            return "رمز التحقق غير صحيح. يرجى المحاولة مرة أخرى أو قول 'إلغاء'.";
        }
    }

    // Case 2: Regular LLM with Trigger Check
    const aiResponse = await getAIResponse(userMessage, history);

    // Check if user is asking for account details
    const accountKeywords = ["رصيدي", "حسابي", "balance", "account", "my data", "بياناتي"];
    const isAskingAccount = accountKeywords.some(k => userMessage.toLowerCase().includes(k));

    if (isAskingAccount) {
        if (!phone) {
            return "للأسف، لا يمكنني التحقق من هويتك عبر هذا الشات المباشر دون رقم هاتف. يرجى الاتصال بنا هاتفياً أو تزويدي برقمك المسجل.";
        }

        const account = await getBankAccount(phone);
        if (account) {
            const otp = await sendOTP(phone);
            if (otp) {
                await saveSession(sessionId, {
                    ...session,
                    otpState: { type: 'WAITING_OTP', otp, phone, timestamp: Date.now() },
                });
                return "لقد قمت بإرسال رمز تحقق (OTP) إلى هاتفك المسجل لدينا. يرجى تزويدي بالرمز لنتمكن من عرض بيانات حسابك بأمان.";
            } else {
                return "عذراً، واجهت مشكلة في إرسال رمز التحقق. يرجى المحاولة لاحقاً.";
            }
        } else {
            return "عذراً، لم أجد حساباً مرتبطاً برقم الهاتف هذا في قاعدة بياناتنا.";
        }
    }

    return aiResponse;
}

// Speak text into a TwiML node using the configured TTS provider.
// Generates audio -> stores in a PRIVATE bucket -> plays via a short-lived signed
// URL (G27). Falls back to Twilio's built-in Polly.Zeina <Say> if TTS/media is
// unavailable (G4 safe fallback). Returns the stored private path (or null).
async function sayOrPlay(node, text) {
    try {
        const audio = await synthesizeNatural(text, { lang: 'ar' });
        if (audio && isMediaConfigured()) {
            const stored = await uploadAndSign(audio.buffer, audio.contentType, 'tts');
            if (stored?.signedUrl) {
                node.play(stored.signedUrl);
                return stored.path;
            }
        }
    } catch (e) {
        logger.error({ err: e.message }, 'sayOrPlay TTS error; using Polly fallback');
    }
    node.say({ voice: 'Polly.Zeina', language: 'arb' }, text);
    return null;
}

// Log Call to Supabase
async function saveCallLog(callSid, userText, aiText, audioPath, ttsProvider) {
    try {
        await supabase.from('call_logs').insert({
            call_sid: callSid,
            user_text: userText,
            ai_text: aiText,
            // Store the PRIVATE storage path (not a public URL). Access via signed URL.
            ai_audio_url: audioPath || `tts://${ttsProvider}`
        });
    } catch (e) {
        console.error("Supabase Log Error:", e.message);
    }
}


// --- Routes ---

app.get('/', (req, res) => res.send('Bank AI v35 (Polly Only Flow)'));
app.get('/voice', (req, res) => res.send("Active at +19166596816"));

app.post('/voice', validateTwilioSignature, async (req, res) => {
    console.log("[Twilio] Inbound Call Handled");
    const twiml = new twilio.twiml.VoiceResponse();

    // The gathered speech will trigger the handle-speech endpoint
    const gather = twiml.gather({
        input: 'speech',
        language: 'ar-SA', // Fixed locale for robust Arabic recognition
        speechTimeout: 'auto',
        action: '/handle-speech'
    });

    // Natural neural greeting (Azure/edge), with Polly.Zeina as last-resort fallback.
    await sayOrPlay(gather, 'أهلاً بك في البنك الإسلامي الفلسطيني، كيف بقدر أساعدك؟');

    // If they don't say anything, wait and redirect
    twiml.say({ voice: 'Polly.Zeina', language: 'arb' }, 'هل ما زلت هنا؟ يرجى طرح سؤالك.');
    twiml.redirect('/voice');

    res.type('text/xml').send(twiml.toString());
});

app.post('/handle-speech', validateTwilioSignature, async (req, res) => {
    const userSpeech = req.body.SpeechResult;
    const callSid = req.body.CallSid;
    const fromPhone = req.body.From;

    console.log(`[Voice] Captured: "${userSpeech || 'Silence'}" from ${fromPhone}`);
    const twiml = new twilio.twiml.VoiceResponse();

    if (userSpeech) {
        console.log(`[Logic] Processing speech...`);
        const aiText = await processMessage(userSpeech, callSid, fromPhone);
        console.log(`[Logic] Result: ${aiText.substring(0, 100)}...`);

        const gather = twiml.gather({
            input: 'speech',
            language: 'ar-SA',
            speechTimeout: 'auto',
            action: '/handle-speech',
            interruptible: true
        });

        // Use the configured TTS provider (Azure by default); private signed-URL playback.
        const audioPath = await sayOrPlay(gather, aiText);
        saveCallLog(callSid, userSpeech, aiText, audioPath, getTtsProvider());

        twiml.redirect('/voice');
    } else {
        console.log("[Twilio] No speech recognized, redirecing to /voice");
        twiml.redirect('/voice');
    }
    res.type('text/xml').send(twiml.toString());
});

// Outbound / Mobile SDK Handlers
app.post('/api/voice-sdk', validateTwilioSignature, (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    const to = req.body.To;

    // Check if it's an outbound call or we just want to dial out to the AI assistant
    if (!to || to === 'AI' || to === process.env.TWILIO_PHONE_NUMBER) {
        // Redirection must be absolute URL if cross-calling or just path
        twiml.redirect(`/voice`);
    } else {
        const dial = twiml.dial({ callerId: process.env.TWILIO_PHONE_NUMBER });
        dial.number(to);
    }
    res.type('text/xml').send(twiml.toString());
});

app.post('/api/make-call', requireAuth, requireRole('agent'), async (req, res) => {
    const { to } = req.body;
    if (!to) return res.status(400).json({ error: "Missing 'to' phone number" });

    try {
        console.log(`[Twilio] Initiating outbound AI call to: ${to}`);
        const call = await client.calls.create({
            url: `${process.env.NGROK_URL}/voice`,
            to: to,
            from: process.env.TWILIO_PHONE_NUMBER
        });
        res.json({ success: true, sid: call.sid });
    } catch (error) {
        console.error("Outbound Call Error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/token', requireAuth, requireRole('agent'), (req, res) => {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const apiKey = process.env.TWILIO_API_KEY;
    const apiSecret = process.env.TWILIO_API_SECRET;
    const outgoingApplicationSid = process.env.TWIML_APP_SID;

    console.log(`[Token] Generating for account: ${accountSid?.substring(0, 5)}...`);
    if (!apiKey || !apiSecret || !outgoingApplicationSid) {
        const missing = [];
        if (!apiKey) missing.push("TWILIO_API_KEY");
        if (!apiSecret) missing.push("TWILIO_API_SECRET");
        if (!outgoingApplicationSid) missing.push("TWIML_APP_SID");
        console.error(`[Token] Failed: Missing ${missing.join(', ')}`);
        return res.status(500).json({ error: `Missing environment variables: ${missing.join(', ')}` });
    }

    const { AccessToken } = twilio.jwt;
    const { VoiceGrant } = AccessToken;
    const identity = 'pib_agent';

    try {
        const accessToken = new AccessToken(accountSid, apiKey, apiSecret, { identity });
        accessToken.addGrant(new VoiceGrant({ outgoingApplicationSid: outgoingApplicationSid, incomingAllow: true }));
        const jwt = accessToken.toJwt();
        console.log(`[Token] Success for identity: ${identity}`);
        res.json({ token: jwt, identity });
    } catch (error) {
        console.error("[Token] Generation Error:", error);
        res.status(500).json({ error: error.message || "An internal error occurred during token generation" });
    }
});

app.post('/api/chat', sessionRateLimiter, async (req, res) => {
    const { message, history, sessionId, phone } = req.body;
    if (!message) return res.status(400).json({ error: "Missing 'message' field" });

    const sessionKey = sessionId || 'web-chat-default';

    try {
        await appendTurn(sessionKey, 'user', message);
        const response = await processMessage(message, sessionKey, phone, history || []);
        await appendTurn(sessionKey, 'assistant', response);
        res.json({ content: response });
    } catch (error) {
        req.log?.error({ err: error.message }, 'Chat error');
        res.status(500).json({ error: 'Failed to process message.' });
    }
});

// --- Dev-only diagnostics & test endpoints --------------------------------
// These bypass Twilio signature checks and auth so the frontend "Backend Tester"
// page (and scripts/simulate-call.mjs) can exercise the chat / voice / TTS paths
// WITHOUT placing real Twilio calls (zero credits). Enabled automatically in
// non-production; to expose them on a deployed/production backend (e.g. so the
// Vercel frontend can reach them), set ENABLE_TEST_ENDPOINTS=true.
const TEST_ENDPOINTS_ENABLED =
    process.env.NODE_ENV !== 'production' || process.env.ENABLE_TEST_ENDPOINTS === 'true';
if (TEST_ENDPOINTS_ENABLED) {
    if (process.env.NODE_ENV === 'production') {
        logger.warn(
            'ENABLE_TEST_ENDPOINTS=true in production: /api/test/* are reachable without auth. Disable when not demoing.'
        );
    }
    // Config snapshot (no secret values, just whether each is configured).
    app.get('/api/test/status', (req, res) => {
        res.json({
            ok: true,
            env: process.env.NODE_ENV || 'development',
            model: MODEL_NAME,
            models: MODEL_LIST,
            ttsProvider: getTtsProvider(),
            redisHealthy: isRedisHealthy(),
            mediaConfigured: isMediaConfigured(),
            twilioSignatureValidation: process.env.TWILIO_VALIDATE_SIGNATURE === 'true',
            providers: {
                openrouter: Boolean(OPENROUTER_KEY),
                supabase: Boolean(process.env.VITE_SUPABASE_URL),
                twilio: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
                whatsappOtp: Boolean(
                    process.env.SECURITY_WHATSAPP_PHONE_NUMBER_ID &&
                        process.env.SECURITY_WHATSAPP_ACCESS_TOKEN
                ),
                azureTts: Boolean(process.env.AZURE_TTS_KEY && process.env.AZURE_TTS_REGION),
                elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID),
                edgeTts: Boolean(process.env.EDGE_TTS_URL),
            },
        });
    });

    // Simulate one voice turn the way Twilio would (speech -> AI reply), but over
    // JSON and with NO signature requirement. Optionally returns synthesized audio.
    app.post('/api/test/voice', async (req, res) => {
        const { message, sessionId, phone, speak } = req.body || {};
        if (!message) return res.status(400).json({ error: "Missing 'message' field" });
        const sessionKey = sessionId || `test-voice-${Date.now()}`;
        try {
            const aiText = await processMessage(message, sessionKey, phone || null);
            let audio = null;
            if (speak) {
                const out = await synthesize(aiText, { lang: 'ar' });
                if (out?.buffer) {
                    audio = {
                        contentType: out.contentType,
                        provider: out.provider,
                        base64: out.buffer.toString('base64'),
                    };
                }
            }
            res.json({ userText: message, aiText, ttsProvider: getTtsProvider(), audio });
        } catch (err) {
            req.log?.error({ err: err.message }, 'test/voice error');
            res.status(500).json({ error: err.message });
        }
    });

    // Synthesize arbitrary text and stream back the audio bytes (tests TTS only).
    app.post('/api/test/tts', async (req, res) => {
        const { text } = req.body || {};
        if (!text) return res.status(400).json({ error: "Missing 'text' field" });
        try {
            const out = await synthesize(text, { lang: 'ar' });
            if (!out?.buffer) {
                return res.status(503).json({
                    error: `TTS provider "${getTtsProvider()}" returned no audio. For free local audio set TTS_PROVIDER=edge and run the edge-tts server (npm run backend).`,
                });
            }
            res.type(out.contentType).send(out.buffer);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    logger.info('Dev test endpoints enabled: /api/test/status, /api/test/voice, /api/test/tts');
}

app.post('/api/sms', requireAuth, requireRole('agent'), async (req, res) => {
    const { to, message } = req.body;
    if (!to || !message) {
        return res.status(400).json({ error: "Missing 'to' or 'message' field." });
    }

    try {
        console.log(`[Manual SMS] To: ${to}, Message: ${message} (Twilio Disabled to save credits)`);
        res.json({
            success: true,
            sid: "SMS_DISABLED_CREDIT_SAFETY",
            note: "Use the Notification Bell for OTPs"
        });
    } catch (error) {
        console.error("SMS error:", error);
        res.status(500).json({ error: error.message });
    }
});

// --- Private media access via short-lived signed URLs (G27) ---
// Role check happens BEFORE signing, so only authorized agents can read media.
app.get('/api/media/sign', requireAuth, requireRole('agent'), async (req, res) => {
    const path = req.query.path;
    if (!path || typeof path !== 'string') {
        return res.status(400).json({ error: "Missing 'path' query parameter." });
    }
    if (!isMediaConfigured()) {
        return res.status(503).json({ error: 'Media storage is not configured.' });
    }
    const signedUrl = await signExistingPath(path);
    if (!signedUrl) {
        return res.status(404).json({ error: 'Could not sign the requested object.' });
    }
    return res.json({ url: signedUrl });
});

// --- WhatsApp Cloud API webhook (G23) ---
// GET: Meta verification handshake.
app.get('/webhook/whatsapp', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
        return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
});

// POST: signature is verified against the raw body BEFORE any processing.
app.post('/webhook/whatsapp', verifyWhatsAppSignature, async (req, res) => {
    // Respond 200 quickly so Meta does not retry; process asynchronously.
    res.sendStatus(200);
    try {
        const entry = req.body?.entry?.[0]?.changes?.[0]?.value;
        const msg = entry?.messages?.[0];
        if (!msg || msg.type !== 'text') return;

        // Deduplicate by WhatsApp message id (state lives in Redis, not memory).
        if (await isDuplicate('whatsapp', msg.id)) {
            req.log?.info({ messageId: msg.id }, 'Duplicate WhatsApp message ignored');
            return;
        }

        const from = msg.from;
        const text = msg.text?.body || '';
        await appendTurn(from, 'user', text);
        const reply = await processMessage(text, from, from);
        await appendTurn(from, 'assistant', reply);

        if (process.env.SECURITY_WHATSAPP_PHONE_NUMBER_ID && process.env.SECURITY_WHATSAPP_ACCESS_TOKEN) {
            const url = `https://graph.facebook.com/v24.0/${process.env.SECURITY_WHATSAPP_PHONE_NUMBER_ID}/messages`;
            await fetch(url, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${process.env.SECURITY_WHATSAPP_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    to: from,
                    type: 'text',
                    text: { body: reply },
                }),
            });
        }
    } catch (err) {
        req.log?.error({ err: err.message }, 'WhatsApp webhook processing error');
    }
});

// --- Streaming voice path with barge-in (G4, experimental) ---
// TwiML that hands the call audio to our WebSocket via Twilio Media Streams.
app.post('/voice/stream', validateTwilioSignature, (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    const host = (process.env.NGROK_URL || '').replace(/^https?:\/\//, '');
    if (!host) {
        // No public host configured; fall back to the stable gather flow.
        twiml.redirect('/voice');
        return res.type('text/xml').send(twiml.toString());
    }
    twiml.say({ voice: 'Polly.Zeina', language: 'arb' }, 'أهلاً بك في البنك الإسلامي الفلسطيني.');
    const connect = twiml.connect();
    connect.stream({ url: `wss://${host}/voice/stream` });
    res.type('text/xml').send(twiml.toString());
});

// Bridge the dead WebSocketServer to Twilio Media Streams.
attachVoiceStream(wss, processMessage);
httpServer.on('upgrade', (request, socket, head) => {
    let pathname = '';
    try {
        pathname = new URL(request.url, 'http://localhost').pathname;
    } catch {
        pathname = request.url || '';
    }
    if (pathname === '/voice/stream') {
        wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
    } else {
        socket.destroy();
    }
});

httpServer.listen(port, '0.0.0.0', () => logger.info({ port, tts: getTtsProvider() }, 'Node voice/API server started'));
