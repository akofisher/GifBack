const DEFAULT_LOCALE = "en";
const SUPPORTED_LOCALES = new Set(["en", "ka"]);

const LOCALE_ALIASES = {
  en: "en",
  eng: "en",
  "en-us": "en",
  "en-gb": "en",
  ka: "ka",
  "ka-ge": "ka",
  ge: "ka",
  geo: "ka",
};

const CODE_TRANSLATIONS = {
  ka: {
    INTERNAL_ERROR: "შიდა სერვერის შეცდომა",
    BAD_REQUEST: "არასწორი მოთხოვნა",
    RATE_LIMIT_EXCEEDED: "მოთხოვნების ლიმიტი გადაჭარბებულია",
    VALIDATION_ERROR: "ვალიდაციის შეცდომა",
    MONGOOSE_VALIDATION_ERROR: "ვალიდაციის შეცდომა",
    INVALID_JSON: "JSON ფორმატი არასწორია",
    INVALID_ID: "არასწორი იდენტიფიკატორი",
    ROUTE_NOT_FOUND: "როუტი ვერ მოიძებნა",

    UNAUTHORIZED: "ავტორიზაცია საჭიროა",
    FORBIDDEN: "წვდომა აკრძალულია",
    MISSING_TOKEN: "ტოკენი არ არის მოწოდებული",
    INVALID_TOKEN: "ტოკენი არასწორია",
    TOKEN_EXPIRED: "ტოკენს ვადა გაუვიდა",
    MISSING_REFRESH_TOKEN: "refresh ტოკენი არ არის მოწოდებული",
    INVALID_REFRESH_TOKEN: "refresh ტოკენი არასწორია",
    REFRESH_TOKEN_REUSED: "refresh ტოკენი გაუქმებულია",
    SESSION_EXPIRED: "სესიას ვადა გაუვიდა",
    SESSION_NOT_FOUND: "სესია ვერ მოიძებნა",

    USER_NOT_FOUND: "მომხმარებელი ვერ მოიძებნა",
    USER_INACTIVE: "მომხმარებელი გამორთულია",
    USER_BLOCKED_TEMPORARY:
      "თქვენი ანგარიში 14 დღით არის დაბლოკილი საზოგადოების წესების დარღვევის გამო. დეტალებისთვის დაუკავშირდით მხარდაჭერას: https://t.me/GiftaApp",
    USER_BLOCKED_PERMANENT:
      "თქვენი ანგარიში მუდმივად არის დაბლოკილი საზოგადოების წესების დარღვევის გამო. დეტალებისთვის დაუკავშირდით მხარდაჭერას: https://t.me/GiftaApp",
    INVALID_CREDENTIALS: "ელფოსტა ან პაროლი არასწორია",
    MISSING_DEVICE_ID: "deviceId აუცილებელია",
    DUPLICATE_KEY: "მონაცემი უკვე გამოყენებულია",
    DUPLICATE_CREDENTIALS: "ელფოსტა ან ტელეფონი უკვე გამოყენებულია",
    PHONE_TAKEN: "ტელეფონის ნომერი უკვე გამოყენებულია",
    EMAIL_CHANGE_NOT_ALLOWED: "ელფოსტის შეცვლა ამ ენდპოინტით აკრძალულია",
    DATE_OF_BIRTH_CHANGE_NOT_ALLOWED:
      "დაბადების თარიღის შეცვლა ამ ენდპოინტით აკრძალულია",
    MISSING_AVATAR_URL: "avatarUrl აუცილებელია",
    MISSING_CURRENT_PASSWORD: "მიმდინარე პაროლი აუცილებელია",
    INVALID_PASSWORD: "პაროლი არასწორია",
    PASSWORD_TOO_SHORT: "პაროლი ძალიან მოკლეა",
    PASSWORD_CONFIRM_MISMATCH: "პაროლები არ ემთხვევა",
    PASSWORD_SAME_AS_OLD: "ახალი პაროლი ძველს არ უნდა ემთხვეოდეს",

    EMAIL_ALREADY_VERIFIED: "ელფოსტა უკვე დადასტურებულია",
    EMAIL_NOT_VERIFIED: "ელფოსტა არ არის დადასტურებული",
    EMAIL_NOT_CONFIGURED: "ელფოსტის სერვისი კონფიგურირებული არ არის",
    EMAIL_TRANSPORT_NOT_AVAILABLE: "ელფოსტის ტრანსპორტი მიუწვდომელია",
    EMAIL_DELIVERY_FAILED: "ელფოსტის გაგზავნა ვერ მოხერხდა",
    EMAIL_VERIFICATION_CODE_INVALID: "ვერიფიკაციის კოდი არასწორია",
    EMAIL_VERIFICATION_CODE_EXPIRED: "ვერიფიკაციის კოდს ვადა გაუვიდა",
    EMAIL_VERIFICATION_RESEND_TOO_SOON:
      "კოდის ხელახლა გაგზავნა ამ ეტაპზე შეუძლებელია",
    EMAIL_VERIFICATION_TOO_MANY_ATTEMPTS:
      "ვერიფიკაციის მცდელობების ლიმიტი ამოიწურა",

    PASSWORD_RESET_CODE_INVALID: "პაროლის აღდგენის კოდი არასწორია",
    PASSWORD_RESET_CODE_EXPIRED: "პაროლის აღდგენის კოდს ვადა გაუვიდა",
    PASSWORD_RESET_RESEND_TOO_SOON:
      "აღდგენის კოდის ხელახლა გაგზავნა ამ ეტაპზე შეუძლებელია",
    PASSWORD_RESET_TOO_MANY_ATTEMPTS:
      "აღდგენის მცდელობების ლიმიტი ამოიწურა",
    PASSWORD_RESET_TOKEN_REQUIRED: "აღდგენის ტოკენი აუცილებელია",
    PASSWORD_RESET_TOKEN_INVALID: "აღდგენის ტოკენი არასწორია",
    PASSWORD_RESET_TOKEN_EXPIRED: "აღდგენის ტოკენს ვადა გაუვიდა",

    AGREEMENT_NOT_FOUND: "მომხმარებლის შეთანხმება ვერ მოიძებნა",
    AGREEMENT_REQUIRED: "მომხმარებლის შეთანხმების მიღება აუცილებელია",
    AGREEMENT_VERSION_MISMATCH: "შეთანხმების ვერსია მოძველებულია",

    ADMIN_SELF_ACTION_FORBIDDEN: "საკუთარ ადმინისტრატორის ანგარიშზე მოქმედება აკრძალულია",
    ADMIN_ACCESS_REQUIRED: "ადმინისტრატორის წვდომა აუცილებელია",
    SUPER_ADMIN_REQUIRED: "სუპერ ადმინისტრატორის წვდომა აუცილებელია",
    ADMIN_PERMISSION_DENIED: "ამ მოქმედებისთვის უფლებები არ გაქვთ",
    ADMIN_ACTION_TARGET_FORBIDDEN:
      "არჩეულ მომხმარებელზე ეს ადმინისტრაციული მოქმედება აკრძალულია",
    MONITORING_DATE_RANGE_INVALID: "მონიტორინგის თარიღების დიაპაზონი არასწორია",
    MONITORING_DATE_RANGE_TOO_LARGE:
      "მონიტორინგის თარიღების დიაპაზონი ძალიან დიდია",
    MONITORING_FILTER_VALIDATION_FAILED:
      "მონიტორინგის ფილტრების ვალიდაცია ვერ შესრულდა",
    USER_DELETE_HAS_ACTIVE_DATA: "მომხმარებელს აქვს აქტიური მონაცემები",

    CATEGORY_NOT_FOUND: "კატეგორია ვერ მოიძებნა",
    CATEGORY_IN_USE: "კატეგორია გამოყენებულია პროდუქტებში",
    LOCATION_COUNTRY_NOT_FOUND: "ქვეყანა ვერ მოიძებნა",
    LOCATION_CITY_NOT_FOUND: "ქალაქი ვერ მოიძებნა",
    LOCATION_CITY_ALREADY_EXISTS: "ქალაქი ამ ქვეყანაში უკვე არსებობს",
    LOCATION_CITY_COUNTRY_MISMATCH: "ქალაქი არჩეულ ქვეყანას არ ეკუთვნის",
    LOCATION_IN_USE: "ლოკაცია გამოყენებულია პროდუქტებში",

    ITEM_NOT_FOUND: "პროდუქტი ვერ მოიძებნა",
    ITEM_NOT_ACTIVE: "პროდუქტი აქტიური არ არის",
    ITEM_RESERVED: "პროდუქტი დაჯავშნულია",
    ITEM_COMPLETED: "პროდუქტი დასრულებულია",
    ITEM_REMOVED: "პროდუქტი წაშლილია",
    ITEM_EDIT_FORBIDDEN_STATUS: "პროდუქტის რედაქტირება აკრძალულია ამ სტატუსში",
    ITEM_MODE_IMMUTABLE: "პროდუქტის რეჟიმის შეცვლა აკრძალულია",
    ITEM_DELETE_FORBIDDEN_STATUS: "პროდუქტის წაშლა აკრძალულია ამ სტატუსში",
    ITEM_DELETE_FORBIDDEN_COMPLETED_GIFT:
      "დასრულებული საჩუქრის წაშლა მხოლოდ ადმინს შეუძლია",

    REQUEST_NOT_FOUND: "მოთხოვნა ვერ მოიძებნა",
    REQUEST_CANNOT_REQUEST_OWN_ITEM:
      "საკუთარ პროდუქტზე მოთხოვნის შექმნა აკრძალულია",
    REQUEST_INVALID_TYPE_FOR_ITEM: "მოთხოვნის ტიპი პროდუქტს არ ემთხვევა",
    REQUEST_ALREADY_PENDING: "პროდუქტს უკვე აქვს მომლოდინე მოთხოვნა",
    REQUEST_NOT_PENDING: "მოთხოვნა მომლოდინე არ არის",
    REQUEST_NOT_APPROVED: "მოთხოვნა დამტკიცებული არ არის",
    REQUEST_APPROVED: "მოთხოვნა დამტკიცებულია",
    REQUEST_REJECTED: "მოთხოვნა უარყოფილია",
    REQUEST_NOT_PARTICIPANT: "თქვენ არ ხართ ამ მოთხოვნის მონაწილე",
    REQUEST_EXPIRED: "მოთხოვნას ვადა გაუვიდა",
    REQUEST_NOT_ACTIVE: "მოთხოვნა აქტიური არ არის",
    REQUEST_NOT_INACTIVE: "მოთხოვნა არ არის არააქტიურ სტატუსში",
    REQUEST_DELETE_FORBIDDEN_COMPLETED:
      "დასრულებული მოთხოვნის წაშლა აკრძალულია",

    EXCHANGE_MODE_REQUIRED: "შემოთავაზებული პროდუქტი უნდა იყოს EXCHANGE რეჟიმში",
    EXCHANGE_OFFER_ITEM_INVALID: "შემოთავაზებული პროდუქტი არასწორია",
    EXCHANGE_OFFER_NOT_OWNED:
      "შემოთავაზებული პროდუქტი მომთხოვნის საკუთრება არ არის",
    EXCHANGE_OFFER_NOT_ACTIVE: "შემოთავაზებული პროდუქტი აქტიური არ არის",
    EXCHANGE_OFFER_ALREADY_REQUESTED:
      "შემოთავაზებულ პროდუქტზე უკვე არსებობს მომლოდინე მოთხოვნა",

    GIFT_LIMIT_WEEKLY: "კვირის საჩუქრის ლიმიტი ამოწურულია",
    GIFT_ACTIVE_LIMIT_REACHED: "აქტიური საჩუქრების ლიმიტი ამოწურულია",
    EXCHANGE_ACTIVE_LIMIT_REACHED: "აქტიური გაცვლების ლიმიტი ამოწურულია",
    STATS_INCONSISTENT: "სტატისტიკის მდგომარეობა არაკონსისტენტურია",

    CHAT_NOT_FOUND: "ჩატი ვერ მოიძებნა",
    CHAT_ACCESS_FORBIDDEN: "ჩატზე წვდომა აკრძალულია",
    CHAT_CLOSED: "ჩატი დახურულია",
    MESSAGE_TEXT_REQUIRED: "შეტყობინების ტექსტი აუცილებელია",

    REPORT_NOT_FOUND: "რეპორტი ვერ მოიძებნა",
    REPORT_CANNOT_REPORT_OWN_ITEM: "საკუთარი პროდუქტის დარეპორტება აკრძალულია",
    REPORT_LIMIT_PRODUCT_24H:
      "24 საათში ამ პროდუქტზე მაქსიმუმ 2 რეპორტის გაგზავნაა შესაძლებელი",

    BLOG_NOT_FOUND: "ბლოგი ვერ მოიძებნა",
    ABOUT_NOT_FOUND: "About Us მონაცემი ვერ მოიძებნა",
  },
};

const TEXT_TRANSLATIONS = {
  ka: {
    "Login successful": "წარმატებული ავტორიზაცია",
    "Registration successful": "რეგისტრაცია წარმატებით დასრულდა",
    "Registration successful. Verification code sent to email":
      "რეგისტრაცია წარმატებით დასრულდა. დადასტურების კოდი გაიგზავნა ელფოსტაზე",
    "Email verified successfully": "ელფოსტა წარმატებით დადასტურდა",
    "Email was already verified": "ელფოსტა უკვე დადასტურებული იყო",
    "If the account exists, a verification code has been sent":
      "თუ ანგარიში არსებობს, დადასტურების კოდი გაგზავნილია",
    "If the account exists, a reset code has been sent":
      "თუ ანგარიში არსებობს, აღდგენის კოდი გაგზავნილია",
    "Code verified successfully": "კოდი წარმატებით დადასტურდა",
    "Password has been reset successfully": "პაროლი წარმატებით განახლდა",
    "Profile updated": "პროფილი განახლდა",
    "Account deleted": "ანგარიში წაიშალა",
    "Password changed successfully": "პაროლი წარმატებით შეიცვალა",
    "Session revoked": "სესია გაუქმდა",
    "Logged out from all devices": "ყველა მოწყობილობიდან მოხდა გამოსვლა",
    "Agreement updated successfully": "შეთანხმება წარმატებით განახლდა",
    "App version config updated": "აპლიკაციის ვერსიის კონფიგურაცია განახლდა",
    "Donation settings updated": "დონაციის პარამეტრები განახლდა",
    "API is running": "API მუშაობს",
    "Too many requests, please try again later.":
      "ძალიან ბევრი მოთხოვნაა, სცადეთ მოგვიანებით.",

    "Validation error": "ვალიდაციის შეცდომა",
    "Invalid id": "არასწორი იდენტიფიკატორი",
    "Token expired": "ტოკენს ვადა გაუვიდა",
    "Invalid token": "ტოკენი არასწორია",
    "Internal Server Error": "შიდა სერვერის შეცდომა",
    "No refresh token": "refresh ტოკენი არ არის მოწოდებული",
    "Session expired": "სესიას ვადა გაუვიდა",
    "User not found": "მომხმარებელი ვერ მოიძებნა",
    "Item not found": "პროდუქტი ვერ მოიძებნა",
    "Report not found": "რეპორტი ვერ მოიძებნა",
    "Blog not found": "ბლოგი ვერ მოიძებნა",
    "About data not found": "About Us მონაცემი ვერ მოიძებნა",
    "Category not found": "კატეგორია ვერ მოიძებნა",
    "Country not found": "ქვეყანა ვერ მოიძებნა",
    "City not found": "ქალაქი ვერ მოიძებნა",
    "Not allowed": "წვდომა აკრძალულია",
    "Request not found": "მოთხოვნა ვერ მოიძებნა",
    "Chat not found": "ჩატი ვერ მოიძებნა",
    "Chat is closed": "ჩატი დახურულია",
    "Message text is required": "შეტყობინების ტექსტი აუცილებელია",
    "Request expired": "მოთხოვნას ვადა გაუვიდა",
    "Wrong password": "პაროლი არასწორია",
    "Current password is required": "მიმდინარე პაროლი აუცილებელია",
    "Phone already in use": "ტელეფონის ნომერი უკვე გამოყენებულია",
    "Passwords do not match": "პაროლები არ ემთხვევა",
    "Password must be at least 6 characters": "პაროლი უნდა იყოს მინიმუმ 6 სიმბოლო",
    "Email already in use": "ელფოსტა უკვე გამოყენებულია",
    "Email and phone already in use": "ელფოსტა და ტელეფონი უკვე გამოყენებულია",
    "Email cannot be changed from this endpoint":
      "ელფოსტის შეცვლა ამ ენდპოინტით აკრძალულია",
    "Date of birth cannot be changed from this endpoint":
      "დაბადების თარიღის შეცვლა ამ ენდპოინტით აკრძალულია",
    "avatarUrl is required": "avatarUrl აუცილებელია",
    "Duplicate value": "დუბლირებული მნიშვნელობა",
    "Email is already verified": "ელფოსტა უკვე დადასტურებულია",
    "Invalid email or password": "ელფოსტა ან პაროლი არასწორია",
    "User is inactive": "მომხმარებელი გამორთულია",
    "You are blocked for 14 days because of breaking our community rules. For more information contact our support team: https://t.me/GiftaApp":
      "თქვენი ანგარიში 14 დღით არის დაბლოკილი საზოგადოების წესების დარღვევის გამო. დეტალებისთვის დაუკავშირდით მხარდაჭერას: https://t.me/GiftaApp",
    "You are permanently blocked because of breaking our community rules. For more information contact our support team: https://t.me/GiftaApp":
      "თქვენი ანგარიში მუდმივად არის დაბლოკილი საზოგადოების წესების დარღვევის გამო. დეტალებისთვის დაუკავშირდით მხარდაჭერას: https://t.me/GiftaApp",
    "Email is not verified. Please verify your email first":
      "ელფოსტა არ არის დადასტურებული. გთხოვთ დაადასტუროთ ელფოსტა",
    "Invalid verification code": "ვერიფიკაციის კოდი არასწორია",
    "Verification code has expired. Please request a new one":
      "ვერიფიკაციის კოდს ვადა გაუვიდა. მოითხოვეთ ახალი კოდი",
    "Please wait before requesting another code":
      "ახალი კოდის მოთხოვნამდე ცოტა ხანს დაელოდეთ",
    "Too many attempts. Please request a new code":
      "მცდელობების ლიმიტი ამოიწურა. მოითხოვეთ ახალი კოდი",
    "Reset token is required": "აღდგენის ტოკენი აუცილებელია",
    "Invalid reset token": "აღდგენის ტოკენი არასწორია",
    "Reset token expired": "აღდგენის ტოკენს ვადა გაუვიდა",
    "Refresh token invalidated": "refresh ტოკენი გაუქმებულია",
    "Session not found": "სესია ვერ მოიძებნა",
    "Route not found": "როუტი ვერ მოიძებნა",
    "You must accept the user agreement":
      "მომხმარებლის შეთანხმების მიღება აუცილებელია",
    "Agreement version is outdated": "შეთანხმების ვერსია მოძველებულია",
    "User agreement is not available": "მომხმარებლის შეთანხმება ვერ მოიძებნა",
    "You cannot change your own admin status":
      "საკუთარ ადმინისტრატორის ანგარიშზე სტატუსის შეცვლა აკრძალულია",
    "You cannot delete your own admin account":
      "საკუთარი ადმინისტრატორის ანგარიშის წაშლა აკრძალულია",
    "Admin access required": "ადმინისტრატორის წვდომა აუცილებელია",
    "Super admin access required": "სუპერ ადმინისტრატორის წვდომა აუცილებელია",
    "Permission denied": "ამ მოქმედებისთვის უფლებები არ გაქვთ",
    "Invalid monitoring date range": "მონიტორინგის თარიღების დიაპაზონი არასწორია",
    "Monitoring date range must not exceed 90 days":
      "მონიტორინგის თარიღების დიაპაზონი არ უნდა აღემატებოდეს 90 დღეს",
    "Invalid monitoring filter": "მონიტორინგის ფილტრი არასწორია",
    "You are not allowed to manage this user":
      "არჩეულ მომხმარებელზე ეს ადმინისტრაციული მოქმედება აკრძალულია",
    "User has active marketplace data": "მომხმარებელს აქვს აქტიური მონაცემები",
    "Category is used by items": "კატეგორია გამოყენებულია პროდუქტებში",
    "Location is used by items": "ლოკაცია გამოყენებულია პროდუქტებში",
    "City already exists in country": "ქალაქი ამ ქვეყანაში უკვე არსებობს",
    "Country is invalid": "ქვეყანა არასწორია",
    "City is invalid": "ქალაქი არასწორია",
    "City not found for selected country":
      "არჩეული ქვეყნისთვის ქალაქი ვერ მოიძებნა",
    "Category not found": "კატეგორია ვერ მოიძებნა",
    "Item is reserved": "პროდუქტი დაჯავშნულია",
    "Item is completed": "პროდუქტი დასრულებულია",
    "Item is removed": "პროდუქტი წაშლილია",
    "Item not active": "პროდუქტი აქტიური არ არის",
    "Item cannot be edited unless ACTIVE":
      "პროდუქტის რედაქტირება შესაძლებელია მხოლოდ ACTIVE სტატუსში",
    "Item mode cannot be changed": "პროდუქტის რეჟიმის შეცვლა აკრძალულია",
    "Only ACTIVE items can be deleted":
      "წაშლა შესაძლებელია მხოლოდ ACTIVE სტატუსის პროდუქტებზე",
    "Cannot request your own item":
      "საკუთარ პროდუქტზე მოთხოვნის შექმნა აკრძალულია",
    "Request type does not match item": "მოთხოვნის ტიპი პროდუქტს არ ემთხვევა",
    "Offered item is required": "შემოთავაზებული პროდუქტი აუცილებელია",
    "Offered item is invalid": "შემოთავაზებული პროდუქტი არასწორია",
    "Offered item not owned by requester":
      "შემოთავაზებული პროდუქტი მომთხოვნის საკუთრება არ არის",
    "Offered item must be EXCHANGE":
      "შემოთავაზებული პროდუქტი უნდა იყოს EXCHANGE რეჟიმში",
    "Offered item not active": "შემოთავაზებული პროდუქტი აქტიური არ არის",
    "Item already has a pending request":
      "პროდუქტს უკვე აქვს მომლოდინე მოთხოვნა",
    "Request is already in process for this item":
      "ამ პროდუქტზე თქვენი მოთხოვნა უკვე პროცესშია",
    "Offered item already has a pending request":
      "შემოთავაზებულ პროდუქტზე უკვე არსებობს მომლოდინე მოთხოვნა",
    "Request is not pending": "მოთხოვნა მომლოდინე არ არის",
    "Request is not approved": "მოთხოვნა დამტკიცებული არ არის",
    "Request is not active": "მოთხოვნა აქტიური არ არის",
    "Request is not inactive": "მოთხოვნა არააქტიური არ არის",
    "Completed requests cannot be hard deleted":
      "დასრულებული მოთხოვნის წაშლა აკრძალულია",
    "Request cannot be completed": "მოთხოვნის დასრულება ვერ მოხერხდა",
    "Request cannot be canceled": "მოთხოვნის გაუქმება ვერ მოხერხდა",
    "Weekly gift limit reached": "კვირის საჩუქრის ლიმიტი ამოწურულია",
    "Active gift items limit reached (max 5)":
      "აქტიური საჩუქრების ლიმიტი ამოწურულია (მაქს. 5)",
    "Active exchange items limit reached (max 5)":
      "აქტიური გაცვლების ლიმიტი ამოწურულია (მაქს. 5)",
    "User stats are inconsistent": "სტატისტიკის მდგომარეობა არაკონსისტენტურია",
    "Provide either link or at least one image":
      "მიუთითეთ ან link, ან მინიმუმ ერთი სურათი",
    "Description is required when category is OTHER":
      "კატეგორია OTHER-ის დროს აღწერა აუცილებელია",
    "countryId and cityId must be provided together":
      "countryId და cityId ერთად უნდა იყოს გადმოცემული",
    "At least one field is required":
      "მინიმუმ ერთი ველი აუცილებელია",
    "Comment is required": "კომენტარი აუცილებელია",
    "Invalid version format": "ვერსიის ფორმატი არასწორია",
    "Version must be numeric dot format, e.g. 1.0.1":
      "ვერსია უნდა იყოს რიცხვითი dot ფორმატში, მაგალითად 1.0.1",
    "Version must be numeric dot format, e.g. 1.0.0":
      "ვერსია უნდა იყოს რიცხვითი dot ფორმატში, მაგალითად 1.0.0",
    "minSupportedVersion cannot be greater than latestVersion":
      "minSupportedVersion ვერ იქნება latestVersion-ზე დიდი",
    "platform is required when currentVersion is provided":
      "currentVersion-ის მითითებისას platform აუცილებელია",
    "preferredLanguage must be en or ka":
      "preferredLanguage უნდა იყოს en ან ka",
  },
};

const normalizeToken = (value) => {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
};

const normalizeLocaleCandidate = (value) => {
  const token = normalizeToken(value);
  if (!token) return null;
  return LOCALE_ALIASES[token] || null;
};

const parseAcceptLanguage = (value) => {
  if (typeof value !== "string" || !value.trim()) return [];
  return value
    .split(",")
    .map((chunk) => chunk.split(";")[0].trim())
    .filter(Boolean);
};

export const normalizeLanguage = (value, fallback = DEFAULT_LOCALE) => {
  const normalized = normalizeLocaleCandidate(value);
  if (normalized && SUPPORTED_LOCALES.has(normalized)) return normalized;
  return fallback;
};

export const resolveRequestLocale = (req) => {
  const explicit =
    req?.headers?.["x-language"] ||
    req?.headers?.["x-lang"] ||
    req?.query?.lang ||
    req?.user?.lang;

  const explicitLocale = normalizeLocaleCandidate(explicit);
  if (explicitLocale) return explicitLocale;

  const acceptedLocales = parseAcceptLanguage(req?.headers?.["accept-language"]);
  for (const candidate of acceptedLocales) {
    const normalized = normalizeLocaleCandidate(candidate);
    if (normalized) return normalized;
  }

  return DEFAULT_LOCALE;
};

export const translateMessage = ({ code, message, locale }) => {
  const normalizedLocale = normalizeLanguage(locale);
  if (normalizedLocale === "en") return message;

  if (code && CODE_TRANSLATIONS[normalizedLocale]?.[code]) {
    return CODE_TRANSLATIONS[normalizedLocale][code];
  }

  if (TEXT_TRANSLATIONS[normalizedLocale]?.[message]) {
    return TEXT_TRANSLATIONS[normalizedLocale][message];
  }

  return message;
};

export const translateDetailMessage = ({ message, locale }) => {
  const normalizedLocale = normalizeLanguage(locale);
  if (normalizedLocale === "en") return message;
  return TEXT_TRANSLATIONS[normalizedLocale]?.[message] || message;
};

export const localizeResponseBody = (body, locale) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;

  const translated = { ...body };

  if (typeof translated.message === "string") {
    translated.message = translateMessage({
      code: translated.code,
      message: translated.message,
      locale,
    });
  }

  if (Array.isArray(translated.errors)) {
    translated.errors = translated.errors.map((entry) => {
      if (!entry || typeof entry !== "object") return entry;
      if (typeof entry.message !== "string") return entry;
      return {
        ...entry,
        message: translateDetailMessage({
          message: entry.message,
          locale,
        }),
      };
    });
  }

  return translated;
};
