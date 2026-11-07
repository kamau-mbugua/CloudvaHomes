/// Converts a minor-units string (e.g. `"200000"`) to whole shillings text (`"2000"`).
String fromHostMinor(String minor) {
  final parsed = int.tryParse(minor.trim()) ?? 0;
  return (parsed ~/ 100).toString();
}

/// Parses whole-shilling user input (`"2000"` or `"2,000"`) into a minor-units string (`"200000"`).
/// Returns `null` when non-whole shillings (e.g. `"2000.50"`) or invalid.
String? toHostMinorString(String kesInput, {bool allowZero = false}) {
  final clean = kesInput.trim().replaceAll(',', '').replaceAll(' ', '');
  if (clean.isEmpty) return null;
  if (!RegExp(r'^\d+$').hasMatch(clean)) return null;
  final whole = int.tryParse(clean);
  if (whole == null) return null;
  if (!allowZero && whole <= 0) return null;
  if (allowZero && whole < 0) return null;
  return (whole * 100).toString();
}

int hostMinorToInt(Object? raw) => switch (raw) {
  int i => i,
  num n => n.round(),
  String s => int.tryParse(s) ?? 0,
  _ => 0,
};

const commonHostAmenities = <String>[
  'Wi-Fi',
  'Kitchen',
  'Free parking',
  'Air conditioning',
  'Washing machine',
  'TV',
  'Hot water',
  'Workspace',
  'Pool',
  'Gym',
  'Balcony',
  'Generator / Backup power',
  '24h Security',
  'Elevator',
];

class StayPaymentRule {
  const StayPaymentRule({
    required this.kind,
    this.depositPercent = 50,
    this.balanceDueDaysBefore = 0,
  });

  final String kind; // FULL_UPFRONT | DEPOSIT | ON_ARRIVAL
  final int depositPercent;
  final int balanceDueDaysBefore;

  factory StayPaymentRule.fromJson(Map<String, dynamic> j) => StayPaymentRule(
    kind: (j['kind'] as String?) ?? 'FULL_UPFRONT',
    depositPercent: (j['depositPercent'] as num?)?.toInt() ?? 50,
    balanceDueDaysBefore: (j['balanceDueDaysBefore'] as num?)?.toInt() ?? 0,
  );

  Map<String, Object?> toJson() => switch (kind) {
    'DEPOSIT' => {
      'kind': 'DEPOSIT',
      'depositPercent': depositPercent,
      'balanceDueDaysBefore': balanceDueDaysBefore,
    },
    'ON_ARRIVAL' => {'kind': 'ON_ARRIVAL'},
    _ => {'kind': 'FULL_UPFRONT'},
  };
}

class StayCancelRule {
  const StayCancelRule({
    required this.kind,
    this.fullRefundDays = 5,
    this.partialRefundDays = 1,
    this.partialPercent = 50,
  });

  final String kind; // FLEXIBLE | MODERATE | STRICT | CUSTOM
  final int fullRefundDays;
  final int partialRefundDays;
  final int partialPercent;

  factory StayCancelRule.fromJson(Map<String, dynamic> j) => StayCancelRule(
    kind: (j['kind'] as String?) ?? 'MODERATE',
    fullRefundDays: (j['fullRefundDays'] as num?)?.toInt() ?? 5,
    partialRefundDays: (j['partialRefundDays'] as num?)?.toInt() ?? 1,
    partialPercent: (j['partialPercent'] as num?)?.toInt() ?? 50,
  );

  Map<String, Object?> toJson() => switch (kind) {
    'CUSTOM' => {
      'kind': 'CUSTOM',
      'fullRefundDays': fullRefundDays,
      'partialRefundDays': partialRefundDays,
      'partialPercent': partialPercent,
    },
    'FLEXIBLE' => {'kind': 'FLEXIBLE'},
    'STRICT' => {'kind': 'STRICT'},
    _ => {'kind': 'MODERATE'},
  };
}

class StayRules {
  const StayRules({
    this.bookingMode = 'INSTANT',
    this.payment = const StayPaymentRule(kind: 'FULL_UPFRONT'),
    this.cancellation = const StayCancelRule(kind: 'MODERATE'),
  });

  final String bookingMode; // INSTANT | REQUEST
  final StayPaymentRule payment;
  final StayCancelRule cancellation;

  factory StayRules.fromJson(Map<String, dynamic> j) => StayRules(
    bookingMode: (j['bookingMode'] as String?) ?? 'INSTANT',
    payment: j['payment'] is Map<String, dynamic>
        ? StayPaymentRule.fromJson(j['payment'] as Map<String, dynamic>)
        : const StayPaymentRule(kind: 'FULL_UPFRONT'),
    cancellation: j['cancellation'] is Map<String, dynamic>
        ? StayCancelRule.fromJson(j['cancellation'] as Map<String, dynamic>)
        : const StayCancelRule(kind: 'MODERATE'),
  );

  Map<String, Object?> toJson() => {
    'bookingMode': bookingMode,
    'payment': payment.toJson(),
    'cancellation': cancellation.toJson(),
  };
}

class HostSite {
  const HostSite({
    required this.slug,
    required this.published,
    required this.businessName,
    required this.about,
    required this.logoUploadId,
    required this.logoUrl,
    required this.contactPhone,
    required this.whatsappPhone,
    required this.rules,
    required this.houseRules,
    required this.checkInTime,
    required this.checkOutTime,
    required this.address,
  });

  final String? slug;
  final bool published;
  final String? businessName;
  final String? about;
  final String? logoUploadId;
  final String? logoUrl;
  final String? contactPhone;
  final String? whatsappPhone;
  final StayRules rules;
  final String? houseRules;
  final String checkInTime;
  final String checkOutTime;
  final String? address;

  factory HostSite.fromJson(Map<String, dynamic> j) => HostSite(
    slug: j['slug'] as String?,
    published: j['published'] == true,
    businessName: j['businessName'] as String?,
    about: j['about'] as String?,
    logoUploadId: j['logoUploadId'] as String?,
    logoUrl: j['logoUrl'] as String?,
    contactPhone: j['contactPhone'] as String?,
    whatsappPhone: j['whatsappPhone'] as String?,
    rules: j['rules'] is Map<String, dynamic>
        ? StayRules.fromJson(j['rules'] as Map<String, dynamic>)
        : const StayRules(),
    houseRules: j['houseRules'] as String?,
    checkInTime: (j['checkInTime'] as String?) ?? '14:00',
    checkOutTime: (j['checkOutTime'] as String?) ?? '11:00',
    address: j['address'] as String?,
  );
}

class ListingPhoto {
  const ListingPhoto({
    required this.id,
    required this.uploadId,
    required this.url,
    required this.position,
    this.caption,
  });

  final String id;
  final String uploadId;
  final String url;
  final int position;
  final String? caption;

  factory ListingPhoto.fromJson(Map<String, dynamic> j) => ListingPhoto(
    id: j['id'] as String,
    uploadId: j['uploadId'] as String,
    url: (j['url'] as String?) ?? '/uploads/${j['uploadId']}/content',
    position: (j['position'] as num?)?.toInt() ?? 0,
    caption: j['caption'] as String?,
  );
}

class SpecialPrice {
  const SpecialPrice({
    required this.id,
    required this.fromDate,
    required this.toDate,
    required this.nightlyPrice,
    this.label,
  });

  final String id;
  final String fromDate;
  final String toDate;
  final String nightlyPrice;
  final String? label;

  factory SpecialPrice.fromJson(Map<String, dynamic> j) => SpecialPrice(
    id: (j['id'] as String?) ?? '',
    fromDate: j['fromDate'] as String,
    toDate: j['toDate'] as String,
    nightlyPrice: j['nightlyPrice'].toString(),
    label: j['label'] as String?,
  );
}

class HostListing {
  const HostListing({
    required this.id,
    required this.unitId,
    required this.unitNumber,
    required this.propertyId,
    required this.propertyCode,
    required this.propertyName,
    this.propertyLocation,
    required this.title,
    this.description,
    required this.bedrooms,
    required this.bathrooms,
    required this.beds,
    required this.maxGuests,
    required this.amenities,
    this.area,
    this.checkInInstructions,
    required this.nightlyPrice,
    this.weekendPrice,
    required this.cleaningFee,
    required this.securityDeposit,
    required this.weeklyDiscountBps,
    required this.monthlyDiscountBps,
    required this.minNights,
    required this.maxNights,
    required this.published,
    this.rulesOverride,
    this.coverUploadId,
    required this.photos,
    required this.specialPrices,
  });

  final String id;
  final String unitId;
  final String unitNumber;
  final String propertyId;
  final String propertyCode;
  final String propertyName;
  final String? propertyLocation;
  final String title;
  final String? description;
  final int bedrooms;
  final int bathrooms;
  final int beds;
  final int maxGuests;
  final List<String> amenities;
  final String? area;
  final String? checkInInstructions;
  final String nightlyPrice;
  final String? weekendPrice;
  final String cleaningFee;
  final String securityDeposit;
  final int weeklyDiscountBps;
  final int monthlyDiscountBps;
  final int minNights;
  final int maxNights;
  final bool published;
  final StayRules? rulesOverride;
  final String? coverUploadId;
  final List<ListingPhoto> photos;
  final List<SpecialPrice> specialPrices;

  int get nightlyPriceCents => hostMinorToInt(nightlyPrice);

  factory HostListing.fromJson(Map<String, dynamic> j) {
    final unit = j['unit'] as Map<String, dynamic>? ?? const {};
    final prop = j['property'] as Map<String, dynamic>? ?? const {};
    return HostListing(
      id: j['id'] as String,
      unitId: (unit['id'] as String?) ?? '',
      unitNumber: (unit['number'] as String?) ?? '',
      propertyId: (prop['id'] as String?) ?? '',
      propertyCode: (prop['code'] as String?) ?? '',
      propertyName: (prop['name'] as String?) ?? '',
      propertyLocation: prop['location'] as String?,
      title: (j['title'] as String?) ?? '',
      description: j['description'] as String?,
      bedrooms: (j['bedrooms'] as num?)?.toInt() ?? 1,
      bathrooms: (j['bathrooms'] as num?)?.toInt() ?? 1,
      beds: (j['beds'] as num?)?.toInt() ?? 1,
      maxGuests: (j['maxGuests'] as num?)?.toInt() ?? 2,
      amenities: [
        for (final a in (j['amenities'] as List? ?? const [])) a.toString(),
      ],
      area: j['area'] as String?,
      checkInInstructions: j['checkInInstructions'] as String?,
      nightlyPrice: (j['nightlyPrice'] ?? '0').toString(),
      weekendPrice: j['weekendPrice']?.toString(),
      cleaningFee: (j['cleaningFee'] ?? '0').toString(),
      securityDeposit: (j['securityDeposit'] ?? '0').toString(),
      weeklyDiscountBps: (j['weeklyDiscountBps'] as num?)?.toInt() ?? 0,
      monthlyDiscountBps: (j['monthlyDiscountBps'] as num?)?.toInt() ?? 0,
      minNights: (j['minNights'] as num?)?.toInt() ?? 1,
      maxNights: (j['maxNights'] as num?)?.toInt() ?? 30,
      published: j['published'] == true,
      rulesOverride: j['rulesOverride'] is Map<String, dynamic>
          ? StayRules.fromJson(j['rulesOverride'] as Map<String, dynamic>)
          : null,
      coverUploadId: j['coverUploadId'] as String?,
      photos: [
        for (final p in (j['photos'] as List? ?? const []))
          if (p is Map<String, dynamic>) ListingPhoto.fromJson(p),
      ],
      specialPrices: [
        for (final sp in (j['specialPrices'] as List? ?? const []))
          if (sp is Map<String, dynamic>) SpecialPrice.fromJson(sp),
      ],
    );
  }
}

class HostBookingLine {
  const HostBookingLine({
    required this.id,
    required this.kind,
    this.date,
    required this.label,
    required this.amountCents,
  });

  final String id;
  final String kind;
  final String? date;
  final String label;
  final int amountCents;

  factory HostBookingLine.fromJson(Map<String, dynamic> j) => HostBookingLine(
    id: (j['id'] as String?) ?? '',
    kind: (j['kind'] as String?) ?? 'NIGHT',
    date: j['date'] as String?,
    label: (j['label'] as String?) ?? '',
    amountCents: hostMinorToInt(j['amount']),
  );
}

class HostPayment {
  const HostPayment({
    required this.id,
    required this.kind,
    required this.method,
    required this.amountCents,
    this.reference,
    this.note,
    required this.paidAt,
  });

  final String id;
  final String kind; // PAYMENT | REFUND
  final String method;
  final int amountCents;
  final String? reference;
  final String? note;
  final String paidAt;

  factory HostPayment.fromJson(Map<String, dynamic> j) => HostPayment(
    id: (j['id'] as String?) ?? '',
    kind: (j['kind'] as String?) ?? 'PAYMENT',
    method: (j['method'] as String?) ?? 'CASH',
    amountCents: hostMinorToInt(j['amount']),
    reference: j['reference'] as String?,
    note: j['note'] as String?,
    paidAt: (j['paidAt'] as String?) ?? '',
  );
}

class HostBooking {
  const HostBooking({
    required this.id,
    required this.code,
    required this.status,
    required this.source,
    required this.checkIn,
    required this.checkOut,
    required this.nights,
    required this.guests,
    this.note,
    this.cancelReason,
    required this.cleaningDone,
    required this.listingId,
    required this.listingTitle,
    required this.unitId,
    required this.unitNumber,
    required this.propertyId,
    required this.propertyCode,
    required this.propertyName,
    required this.guestId,
    required this.guestName,
    required this.guestPhone,
    this.guestEmail,
    this.totalCents,
    this.subtotalCents,
    this.discountCents,
    this.cleaningFeeCents,
    this.securityDepositCents,
    this.dueNowCents,
    this.amountPaidCents,
    this.amountRefundedCents,
    this.owedCents,
    this.balanceDueOn,
    this.lines = const [],
    this.payments = const [],
  });

  final String id;
  final String code;
  final String status;
  final String source;
  final String checkIn;
  final String checkOut;
  final int nights;
  final int guests;
  final String? note;
  final String? cancelReason;
  final bool cleaningDone;
  final String listingId;
  final String listingTitle;
  final String unitId;
  final String unitNumber;
  final String propertyId;
  final String propertyCode;
  final String propertyName;
  final String guestId;
  final String guestName;
  final String guestPhone;
  final String? guestEmail;

  /// Null when the server omitted money fields (e.g. caretaker without `stay-payments:view`).
  final int? totalCents;
  final int? subtotalCents;
  final int? discountCents;
  final int? cleaningFeeCents;
  final int? securityDepositCents;
  final int? dueNowCents;
  final int? amountPaidCents;
  final int? amountRefundedCents;
  final int? owedCents;
  final String? balanceDueOn;
  final List<HostBookingLine> lines;
  final List<HostPayment> payments;

  bool get hasMoney => totalCents != null;

  factory HostBooking.fromJson(Map<String, dynamic> j) {
    final listing = j['listing'] as Map<String, dynamic>? ?? const {};
    final unit = j['unit'] as Map<String, dynamic>? ?? const {};
    final prop = j['property'] as Map<String, dynamic>? ?? const {};
    final guest = j['guest'] as Map<String, dynamic>? ?? const {};
    final hasTotal = j.containsKey('total') && j['total'] != null;
    return HostBooking(
      id: (j['id'] as String?) ?? '',
      code: (j['code'] as String?) ?? '',
      status: (j['status'] as String?) ?? 'CONFIRMED',
      source: (j['source'] as String?) ?? 'DIRECT',
      checkIn: (j['checkIn'] as String?) ?? '',
      checkOut: (j['checkOut'] as String?) ?? '',
      nights: (j['nights'] as num?)?.toInt() ?? 1,
      guests: (j['guests'] as num?)?.toInt() ?? 1,
      note: j['note'] as String?,
      cancelReason: j['cancelReason'] as String?,
      cleaningDone: j['cleaningDone'] == true,
      listingId: (listing['id'] as String?) ?? '',
      listingTitle: (listing['title'] as String?) ?? '',
      unitId: (unit['id'] as String?) ?? '',
      unitNumber: (unit['number'] as String?) ?? '',
      propertyId: (prop['id'] as String?) ?? '',
      propertyCode: (prop['code'] as String?) ?? '',
      propertyName: (prop['name'] as String?) ?? '',
      guestId: (guest['id'] as String?) ?? '',
      guestName: (guest['name'] as String?) ?? '',
      guestPhone: (guest['phone'] as String?) ?? '',
      guestEmail: guest['email'] as String?,
      totalCents: hasTotal ? hostMinorToInt(j['total']) : null,
      subtotalCents: hasTotal ? hostMinorToInt(j['subtotal']) : null,
      discountCents: hasTotal ? hostMinorToInt(j['discount']) : null,
      cleaningFeeCents: hasTotal ? hostMinorToInt(j['cleaningFee']) : null,
      securityDepositCents: hasTotal
          ? hostMinorToInt(j['securityDeposit'])
          : null,
      dueNowCents: hasTotal ? hostMinorToInt(j['dueNow']) : null,
      amountPaidCents: hasTotal ? hostMinorToInt(j['amountPaid']) : null,
      amountRefundedCents: hasTotal
          ? hostMinorToInt(j['amountRefunded'])
          : null,
      owedCents: hasTotal ? hostMinorToInt(j['owed']) : null,
      balanceDueOn: j['balanceDueOn'] as String?,
      lines: [
        for (final l in (j['lines'] as List? ?? const []))
          if (l is Map<String, dynamic>) HostBookingLine.fromJson(l),
      ],
      payments: [
        for (final p in (j['payments'] as List? ?? const []))
          if (p is Map<String, dynamic>) HostPayment.fromJson(p),
      ],
    );
  }
}

class HostQuote {
  const HostQuote({
    required this.nights,
    required this.totalCents,
    required this.dueNowCents,
    required this.balanceCents,
    this.balanceDueOn,
    required this.payWhenText,
    required this.cancellationText,
  });

  final int nights;
  final int totalCents;
  final int dueNowCents;
  final int balanceCents;
  final String? balanceDueOn;
  final String payWhenText;
  final String cancellationText;

  factory HostQuote.fromJson(Map<String, dynamic> j) => HostQuote(
    nights: (j['nights'] as num?)?.toInt() ?? 1,
    totalCents: hostMinorToInt(j['total']),
    dueNowCents: hostMinorToInt(j['dueNow']),
    balanceCents: hostMinorToInt(j['balance']),
    balanceDueOn: j['balanceDueOn'] as String?,
    payWhenText: (j['payWhenText'] as String?) ?? '',
    cancellationText: (j['cancellationText'] as String?) ?? '',
  );
}

class HostCleaningTask {
  const HostCleaningTask({
    required this.id,
    required this.status,
    required this.unitId,
    required this.unitNumber,
    required this.unitTitle,
    required this.propertyId,
    required this.propertyName,
    required this.since,
    this.nextCheckIn,
    this.note,
    this.doneAt,
  });

  final String id;
  final String status; // OPEN | DONE
  final String unitId;
  final String unitNumber;
  final String unitTitle;
  final String propertyId;
  final String propertyName;
  final String since;
  final String? nextCheckIn;
  final String? note;
  final String? doneAt;

  factory HostCleaningTask.fromJson(Map<String, dynamic> j) {
    final unit = j['unit'] as Map<String, dynamic>? ?? const {};
    final prop = j['property'] as Map<String, dynamic>? ?? const {};
    return HostCleaningTask(
      id: (j['id'] as String?) ?? '',
      status: (j['status'] as String?) ?? 'OPEN',
      unitId: (unit['id'] as String?) ?? '',
      unitNumber: (unit['number'] as String?) ?? '',
      unitTitle:
          (unit['title'] as String?) ?? (unit['number'] as String?) ?? '',
      propertyId: (prop['id'] as String?) ?? '',
      propertyName: (prop['name'] as String?) ?? '',
      since: (j['since'] as String?) ?? '',
      nextCheckIn: j['nextCheckIn'] as String?,
      note: j['note'] as String?,
      doneAt: j['doneAt'] as String?,
    );
  }
}

class HostGuestStay {
  const HostGuestStay({
    required this.id,
    required this.code,
    required this.status,
    required this.checkIn,
    required this.checkOut,
    required this.listingTitle,
    required this.unitNumber,
    this.amountPaidCents,
  });

  final String id;
  final String code;
  final String status;
  final String checkIn;
  final String checkOut;
  final String listingTitle;
  final String unitNumber;

  /// Null when the caller can't see stay payments.
  final int? amountPaidCents;

  factory HostGuestStay.fromJson(Map<String, dynamic> j) {
    final listing = j['listing'] as Map<String, dynamic>? ?? const {};
    final unit = j['unit'] as Map<String, dynamic>? ?? const {};
    return HostGuestStay(
      id: (j['id'] as String?) ?? '',
      code: (j['code'] as String?) ?? '',
      status: (j['status'] as String?) ?? '',
      checkIn: (j['checkIn'] as String?) ?? '',
      checkOut: (j['checkOut'] as String?) ?? '',
      listingTitle: (listing['title'] as String?) ?? '',
      unitNumber: (unit['number'] as String?) ?? '',
      amountPaidCents: j['amountPaid'] == null
          ? null
          : hostMinorToInt(j['amountPaid']),
    );
  }
}

class HostGuest {
  const HostGuest({
    required this.id,
    required this.name,
    required this.phone,
    this.email,
    this.notes,
    required this.doNotAccept,
    this.idNumberHint,
    required this.staysCount,
    this.totalPaidCents,
    this.lastStay,
    this.stays = const [],
  });

  final String id;
  final String name;
  final String phone;
  final String? email;
  final String? notes;
  final bool doNotAccept;
  final String? idNumberHint;
  final int staysCount;

  /// Null when the caller can't see stay payments.
  final int? totalPaidCents;
  final String? lastStay;
  final List<HostGuestStay> stays;

  factory HostGuest.fromJson(Map<String, dynamic> j) {
    final staysList = j['stays'];
    final parsedStays = staysList is List
        ? [
            for (final s in staysList)
              if (s is Map<String, dynamic>) HostGuestStay.fromJson(s),
          ]
        : const <HostGuestStay>[];
    final count =
        (j['staysCount'] as num?)?.toInt() ??
        (staysList is num ? staysList.toInt() : parsedStays.length);
    return HostGuest(
      id: (j['id'] as String?) ?? '',
      name: (j['name'] as String?) ?? '',
      phone: (j['phone'] as String?) ?? '',
      email: j['email'] as String?,
      notes: j['notes'] as String?,
      doNotAccept: j['doNotAccept'] == true,
      idNumberHint: j['idNumberHint'] as String?,
      staysCount: count,
      totalPaidCents: j['totalPaid'] == null
          ? null
          : hostMinorToInt(j['totalPaid']),
      lastStay: j['lastStay'] as String?,
      stays: parsedStays,
    );
  }
}

class HostReportUnitRow {
  const HostReportUnitRow({
    required this.unitId,
    required this.unitNumber,
    required this.title,
    required this.propertyName,
    required this.receivedCents,
    required this.refundedCents,
    required this.bookedValueCents,
    required this.expensesCents,
    required this.profitCents,
    required this.nights,
    required this.occupancy,
    required this.adrCents,
  });

  final String unitId;
  final String unitNumber;
  final String title;
  final String propertyName;
  final int receivedCents;
  final int refundedCents;
  final int bookedValueCents;
  final int expensesCents;
  final int profitCents;
  final int nights;
  final double occupancy;
  final int adrCents;

  factory HostReportUnitRow.fromJson(Map<String, dynamic> j) {
    final prop = j['property'] as Map<String, dynamic>? ?? const {};
    return HostReportUnitRow(
      unitId: (j['unitId'] as String?) ?? '',
      unitNumber: (j['unitNumber'] as String?) ?? '',
      title: (j['title'] as String?) ?? '',
      propertyName: (prop['name'] as String?) ?? '',
      receivedCents: hostMinorToInt(j['received']),
      refundedCents: hostMinorToInt(j['refunded']),
      bookedValueCents: hostMinorToInt(j['bookedValue']),
      expensesCents: hostMinorToInt(j['expenses']),
      profitCents: hostMinorToInt(j['profit']),
      nights: (j['nights'] as num?)?.toInt() ?? 0,
      occupancy: (j['occupancy'] as num?)?.toDouble() ?? 0,
      adrCents: hostMinorToInt(j['adr']),
    );
  }
}

class HostReportSummary {
  const HostReportSummary({
    required this.rows,
    required this.totalReceivedCents,
    required this.totalRefundedCents,
    required this.totalBookedValueCents,
    required this.totalExpensesCents,
    required this.totalSharedExpensesCents,
    required this.totalProfitCents,
    required this.totalNights,
    required this.totalOccupancy,
    required this.totalAdrCents,
  });

  final List<HostReportUnitRow> rows;
  final int totalReceivedCents;
  final int totalRefundedCents;
  final int totalBookedValueCents;
  final int totalExpensesCents;
  final int totalSharedExpensesCents;
  final int totalProfitCents;
  final int totalNights;
  final double totalOccupancy;
  final int totalAdrCents;

  factory HostReportSummary.fromJson(Map<String, dynamic> j) {
    final totals = j['totals'] as Map<String, dynamic>? ?? const {};
    return HostReportSummary(
      rows: [
        for (final r in (j['rows'] as List? ?? const []))
          if (r is Map<String, dynamic>) HostReportUnitRow.fromJson(r),
      ],
      totalReceivedCents: hostMinorToInt(totals['received']),
      totalRefundedCents: hostMinorToInt(totals['refunded']),
      totalBookedValueCents: hostMinorToInt(totals['bookedValue']),
      totalExpensesCents: hostMinorToInt(totals['expenses']),
      totalSharedExpensesCents: hostMinorToInt(totals['sharedExpenses']),
      totalProfitCents: hostMinorToInt(totals['profit']),
      totalNights: (totals['nights'] as num?)?.toInt() ?? 0,
      totalOccupancy: (totals['occupancy'] as num?)?.toDouble() ?? 0,
      totalAdrCents: hostMinorToInt(totals['adr']),
    );
  }
}
